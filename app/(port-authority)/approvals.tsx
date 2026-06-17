import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  ActivityIndicator,
  TouchableRipple,
  Button,
  Chip,
  Portal,
  Modal,
  Snackbar,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { useOrderDetail, type LineItemDetail } from '@/hooks/useOrderDetail';
import { supabase } from '@/lib/supabase';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import DocumentCard from '@/components/shared/DocumentCard';
import { SERVICE_CATEGORIES } from '@/constants/serviceCategories';
import type { Order, OrderDocument } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const PA_SERVICE_NAMES = new Set(
  SERVICE_CATEGORIES.filter((c) => c.requiresPortAuthorityApproval).map((c) => c.name),
);

function isPaService(name: string | null | undefined): boolean {
  return !!name && PA_SERVICE_NAMES.has(name);
}

function formatQty(qty: number | null, unit: string | null): string {
  if (qty == null) return unit ?? '';
  return `${qty}${unit ? ` ${unit}` : ''}`;
}

export default function PortAuthorityApprovals() {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { data: orders, isLoading, error, refetch } = useOrders('port_authority', userId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const pending = useMemo(
    () => orders.filter((o: Order) => o.overall_status === 'pending_port_approval'),
    [orders],
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Port Approvals" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load approval requests.</Text>
          <Button
            mode="outlined"
            textColor={palette.steelBlue}
            style={styles.retryBtn}
            onPress={() => refetch()}
          >
            Retry
          </Button>
        </View>
      ) : pending.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="shield-checkmark-outline" size={36} color={palette.hullGray} />
          <Text style={styles.stateText}>
            No orders awaiting port sign-off. You're all caught up.
          </Text>
        </View>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          onRefresh={refetch}
          refreshing={false}
          renderItem={({ item }) => (
            <ApprovalCard order={item} onPress={() => setSelectedId(item.id)} />
          )}
        />
      )}

      <Portal>
        <Modal
          visible={!!selectedId}
          onDismiss={() => setSelectedId(null)}
          contentContainerStyle={styles.modal}
        >
          {selectedId ? (
            <OrderDetailSheet
              orderId={selectedId}
              onClose={() => setSelectedId(null)}
              onApproved={() => {
                setSelectedId(null);
                setSnack('Order activated — stakeholders notified.');
              }}
              onError={(msg) => setSnack(msg)}
            />
          ) : null}
        </Modal>
      </Portal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={4000}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

function ApprovalCard({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <Card style={styles.card} mode="contained">
      <TouchableRipple onPress={onPress} borderless style={styles.ripple}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber}>{order.order_number ?? 'Draft Order'}</Text>
            <OrderStatusBadge status={order.overall_status} />
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="boat-outline" size={15} color={palette.hullGray} />
            <Text style={styles.metaText} numberOfLines={1}>
              {order.vessel_name}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={15} color={palette.hullGray} />
            <Text style={styles.metaText}>
              {order.eta ? `ETA ${dayjs(order.eta).format('MMM D, HH:mm')}` : 'No ETA'}
            </Text>
            <Text style={styles.metaDate}>{dayjs(order.created_at).format('MMM D')}</Text>
          </View>

          <View style={styles.reviewRow}>
            <Ionicons name="open-outline" size={15} color={palette.steelBlue} />
            <Text style={styles.reviewText}>Tap to review &amp; sign off</Text>
          </View>
        </Card.Content>
      </TouchableRipple>
    </Card>
  );
}

function OrderDetailSheet({
  orderId,
  onClose,
  onApproved,
  onError,
}: {
  orderId: string;
  onClose: () => void;
  onApproved: () => void;
  onError: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const { order, lineItems, documents, isLoading, error } = useOrderDetail(orderId);
  const [submitting, setSubmitting] = useState(false);

  const paItems = lineItems.filter((li: LineItemDetail) => isPaService(li.service_categories?.name));
  const otherItems = lineItems.filter((li: LineItemDetail) => !isPaService(li.service_categories?.name));

  async function handleApprove() {
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ overall_status: 'active' })
        .eq('id', orderId);
      if (updateError) throw updateError;

      // Notifying captain + ship agent requires inserting rows for other users,
      // which RLS blocks for the PA. Delegate to the privileged edge function.
      const { error: fnError } = await supabase.functions.invoke('notify-stakeholders', {
        body: {
          order_id: orderId,
          event: 'port_authority_approved',
          type: 'order_update',
          title: 'Port Authority Approved',
          body: `${order?.order_number ?? 'Order'} has been activated by the port authority.`,
          recipients: ['captain', 'ship_agent'],
        },
      });
      if (fnError) {
        // The status change already succeeded; surface a soft warning.
        onError('Order activated, but stakeholder notification failed.');
      }

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      onApproved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to approve order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.sheetState}>
        <ActivityIndicator color={palette.steelBlue} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.sheetState}>
        <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
        <Text style={styles.stateText}>Couldn't load this order.</Text>
        <Button mode="text" textColor={palette.steelBlue} onPress={onClose}>
          Close
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetOrderNumber}>{order.order_number ?? 'Draft Order'}</Text>
          <Text style={styles.sheetVessel} numberOfLines={1}>
            {order.vessel_name}
          </Text>
        </View>
        <OrderStatusBadge status={order.overall_status} />
      </View>

      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={palette.hullGray} />
          <Text style={styles.detailText}>{order.port?.name ?? 'Port unassigned'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color={palette.hullGray} />
          <Text style={styles.detailText}>
            {order.eta ? `ETA ${dayjs(order.eta).format('MMM D, YYYY HH:mm')}` : 'No ETA'}
            {order.etd ? `  ·  ETD ${dayjs(order.etd).format('MMM D, HH:mm')}` : ''}
          </Text>
        </View>
        {order.imo_number ? (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={16} color={palette.hullGray} />
            <Text style={styles.detailText}>IMO {order.imo_number}</Text>
          </View>
        ) : null}

        <Text style={styles.groupTitle}>
          Port-Regulated Services ({paItems.length})
        </Text>
        {paItems.length === 0 ? (
          <Text style={styles.emptyLine}>No port-regulated line items on this order.</Text>
        ) : (
          paItems.map((li: LineItemDetail) => (
            <View key={li.id} style={[styles.lineItem, styles.lineItemHighlight]}>
              <View style={styles.lineItemHead}>
                <Ionicons name="shield-checkmark" size={16} color={palette.signalAmber} />
                <Text style={styles.lineItemName} numberOfLines={1}>
                  {li.service_categories?.name ?? 'Service'}
                </Text>
                <Chip
                  compact
                  style={styles.regChip}
                  textStyle={styles.regChipText}
                >
                  Requires approval
                </Chip>
              </View>
              <Text style={styles.lineItemMeta}>{formatQty(li.quantity, li.unit)}</Text>
              {li.specifications ? (
                <Text style={styles.lineItemSpec} numberOfLines={3}>
                  {li.specifications}
                </Text>
              ) : null}
            </View>
          ))
        )}

        {otherItems.length > 0 ? (
          <>
            <Text style={styles.groupTitle}>Other Services ({otherItems.length})</Text>
            <Text style={styles.readonlyNote}>Read-only — outside port authority remit.</Text>
            {otherItems.map((li: LineItemDetail) => (
              <View key={li.id} style={styles.lineItem}>
                <View style={styles.lineItemHead}>
                  <Ionicons name="cube-outline" size={16} color={palette.hullGray} />
                  <Text style={styles.lineItemNameMuted} numberOfLines={1}>
                    {li.service_categories?.name ?? 'Service'}
                  </Text>
                </View>
                <Text style={styles.lineItemMeta}>{formatQty(li.quantity, li.unit)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.groupTitle}>Documents ({documents.length})</Text>
        {documents.length === 0 ? (
          <Text style={styles.emptyLine}>No documents attached.</Text>
        ) : (
          documents.map((doc: OrderDocument) => <DocumentCard key={doc.id} document={doc} />)
        )}
      </ScrollView>

      <View style={styles.sheetActions}>
        <Button
          mode="text"
          textColor={palette.hullGray}
          onPress={onClose}
          disabled={submitting}
          style={styles.actionFlex}
        >
          Close
        </Button>
        <Button
          mode="contained"
          buttonColor={palette.engineGreen}
          textColor={palette.fogWhite}
          icon={() => <Ionicons name="checkmark-circle" size={18} color={palette.fogWhite} />}
          onPress={handleApprove}
          loading={submitting}
          disabled={submitting}
          style={styles.actionFlex}
        >
          Approve (Activate)
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryBtn: { marginTop: spacing.md, borderColor: palette.steelBlue },

  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  ripple: { borderRadius: radius.md },
  cardContent: { paddingVertical: spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  orderNumber: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 14, flexShrink: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  metaText: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14, flex: 1 },
  metaDate: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    borderTopColor: palette.navyDeep,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  reviewText: { fontFamily: fonts.bodyMedium, color: palette.steelBlue, fontSize: 13 },

  modal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  sheet: { flex: 0, maxHeight: '100%' },
  sheetState: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomColor: palette.oceanMid,
    borderBottomWidth: 1,
  },
  sheetOrderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  sheetVessel: {
    fontFamily: fonts.display,
    color: palette.fogWhite,
    fontSize: 20,
    marginTop: 2,
  },
  sheetScroll: { maxHeight: 460 },
  sheetScrollContent: { padding: spacing.md },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  detailText: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14, flex: 1 },
  groupTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 15,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  readonlyNote: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  emptyLine: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  lineItem: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lineItemHighlight: {
    borderLeftWidth: 3,
    borderLeftColor: palette.signalAmber,
  },
  lineItemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  lineItemName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 15,
  },
  lineItemNameMuted: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    color: palette.hullGray,
    fontSize: 15,
  },
  regChip: { height: 24, backgroundColor: palette.signalAmber },
  regChipText: {
    color: palette.navyDeep,
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
    marginVertical: 0,
  },
  lineItemMeta: {
    fontFamily: fonts.mono,
    color: palette.steelBlue,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  lineItemSpec: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopColor: palette.oceanMid,
    borderTopWidth: 1,
  },
  actionFlex: { flex: 1, borderRadius: radius.sm },
});

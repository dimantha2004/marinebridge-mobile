import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Text,
  ActivityIndicator,
  List,
  Divider,
  Portal,
  Modal,
  Snackbar,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOrderDetail, type LineItemDetail } from '@/hooks/useOrderDetail';
import type { OrderDocument } from '@/types/database';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import TimelineTracker from '@/components/shared/TimelineTracker';
import DocumentCard from '@/components/shared/DocumentCard';
import MessageThread from '@/components/shared/MessageThread';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const CANCELLABLE = ['draft', 'charter_rejected'];

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : null;
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const queryClient = useQueryClient();

  const { order, lineItems, documents, isLoading, error, refetch } = useOrderDetail(orderId);

  const [chatLineItem, setChatLineItem] = useState<LineItemDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  // Realtime: live updates for this order + its line items.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-detail:${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', orderId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_line_items', filter: `order_id=eq.${orderId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', orderId, 'line-items'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_documents', filter: `order_id=eq.${orderId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', orderId, 'documents'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  const handleCancel = async () => {
    if (!orderId) return;
    setCancelling(true);
    const { error: cancelError } = await supabase
      .from('orders')
      .update({ overall_status: 'cancelled' })
      .eq('id', orderId);
    setCancelling(false);
    if (cancelError) {
      setSnack(cancelError.message);
      return;
    }
    await refetch();
    setSnack('Order cancelled.');
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load this order.</Text>
        </View>
      </View>
    );
  }

  const canCancel = CANCELLABLE.includes(order.overall_status);
  const canPay = order.overall_status === 'pending_payment';

  return (
    <View style={styles.screen}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header block */}
        <View style={styles.headerBlock}>
          <Text style={styles.orderNumber}>{order.order_number ?? 'Draft Order'}</Text>
          <Text style={styles.vessel}>{order.vessel_name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={palette.hullGray} />
            <Text style={styles.metaText}>{order.port?.name ?? 'Port'}</Text>
            {order.eta ? (
              <>
                <Ionicons name="time-outline" size={14} color={palette.hullGray} style={styles.metaIconGap} />
                <Text style={styles.metaText}>ETA {dayjs(order.eta).format('MMM D, HH:mm')}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.badgeRow}>
            <OrderStatusBadge status={order.overall_status} />
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.card}>
          <TimelineTracker current={order.overall_status} />
        </View>

        {order.charter_comments ? (
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>Charter Note</Text>
            <Text style={styles.commentText}>{order.charter_comments}</Text>
          </View>
        ) : null}

        {/* Line items */}
        <Text style={styles.sectionTitle}>Services ({lineItems.length})</Text>
        {lineItems.length === 0 ? (
          <Text style={styles.emptyText}>No services on this order.</Text>
        ) : (
          <List.AccordionGroup>
            {lineItems.map((li: LineItemDetail) => {
              const supplierName =
                li.supplier_mapping?.supplier_profile?.company_name ??
                li.supplier_mapping?.supplier_profile?.full_name ??
                null;
              return (
                <List.Accordion
                  key={li.id}
                  id={li.id}
                  style={styles.accordion}
                  titleStyle={styles.accordionTitle}
                  title={li.service_categories?.name ?? 'Service'}
                  description={`${li.quantity ?? ''} ${li.unit ?? ''}`.trim()}
                  descriptionStyle={styles.accordionDesc}
                  left={(p) => (
                    <List.Icon
                      {...p}
                      icon={() => (
                        <Ionicons
                          name={(li.service_categories?.icon_name ?? 'cube') as keyof typeof Ionicons.glyphMap}
                          size={22}
                          color={palette.steelBlue}
                        />
                      )}
                    />
                  )}
                >
                  <View style={styles.accordionBody}>
                    <View style={styles.lineRow}>
                      <OrderStatusBadge status={li.line_status} kind="line" />
                    </View>

                    {li.requested_datetime ? (
                      <DetailLine icon="calendar-outline" label="Requested" value={dayjs(li.requested_datetime).format('MMM D, YYYY · HH:mm')} />
                    ) : null}
                    {li.specifications ? (
                      <DetailLine icon="document-text-outline" label="Specifications" value={li.specifications} />
                    ) : null}
                    {li.unit_price != null ? (
                      <DetailLine icon="pricetag-outline" label="Unit Price" value={`$${li.unit_price.toFixed(2)}`} />
                    ) : null}
                    {li.total_price != null ? (
                      <DetailLine icon="cash-outline" label="Line Total" value={`$${li.total_price.toFixed(2)}`} />
                    ) : null}
                    {li.supplier_decline_reason ? (
                      <DetailLine icon="alert-circle-outline" label="Decline Reason" value={li.supplier_decline_reason} />
                    ) : null}

                    <Button
                      mode="outlined"
                      style={styles.chatBtn}
                      textColor={palette.steelBlue}
                      icon={() => <Ionicons name="chatbubbles-outline" size={18} color={palette.steelBlue} />}
                      onPress={() => setChatLineItem(li)}
                    >
                      Open Chat
                    </Button>
                  </View>
                </List.Accordion>
              );
            })}
          </List.AccordionGroup>
        )}

        {/* Documents */}
        <Text style={styles.sectionTitle}>Documents</Text>
        {documents.length === 0 ? (
          <Text style={styles.emptyText}>No documents yet.</Text>
        ) : (
          documents.map((doc: OrderDocument) => <DocumentCard key={doc.id} document={doc} />)
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {canPay ? (
            <Button
              mode="contained"
              style={styles.payBtn}
              contentStyle={styles.actionBtnContent}
              labelStyle={styles.actionBtnLabel}
              icon={() => <Ionicons name="card" size={18} color={palette.fogWhite} />}
              onPress={() => router.push(`/(captain)/new-order/checkout?id=${order.id}`)}
            >
              Pay Now
            </Button>
          ) : null}

          {canCancel ? (
            <Button
              mode="outlined"
              loading={cancelling}
              disabled={cancelling}
              style={styles.cancelBtn}
              contentStyle={styles.actionBtnContent}
              textColor={palette.alertRed}
              onPress={handleCancel}
            >
              Cancel Order
            </Button>
          ) : null}
        </View>
      </ScrollView>

      {/* Chat modal */}
      <Portal>
        <Modal
          visible={chatLineItem !== null}
          onDismiss={() => setChatLineItem(null)}
          contentContainerStyle={styles.chatModal}
        >
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>{chatLineItem?.service_categories?.name ?? 'Chat'}</Text>
            <Button mode="text" textColor={palette.hullGray} onPress={() => setChatLineItem(null)}>
              Close
            </Button>
          </View>
          <Divider style={styles.divider} />
          {orderId && chatLineItem && userId ? (
            <MessageThread orderId={orderId} lineItemId={chatLineItem.id} currentUserId={userId} />
          ) : null}
        </Modal>
      </Portal>

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={4000} style={styles.snackbar}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <Appbar.Header style={styles.appbar}>
      <Appbar.BackAction color={palette.fogWhite} onPress={onBack} />
      <Appbar.Content title="Order Detail" titleStyle={styles.appbarTitle} />
    </Appbar.Header>
  );
}

function DetailLine({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={15} color={palette.hullGray} />
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  headerBlock: { marginBottom: spacing.md },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  vessel: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 24, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  metaIconGap: { marginLeft: spacing.sm },
  metaText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  badgeRow: { marginTop: spacing.sm },
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.md },
  commentCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: palette.signalAmber },
  commentLabel: { fontFamily: fonts.bodySemiBold, color: palette.signalAmber, fontSize: 12, marginBottom: spacing.xs },
  commentText: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 14 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginBottom: spacing.sm },
  accordion: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  accordionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  accordionDesc: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12 },
  accordionBody: { backgroundColor: palette.navyDeep, padding: spacing.md, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  detailLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 13 },
  detailValue: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 13, flexShrink: 1 },
  chatBtn: { borderColor: palette.steelBlue, borderRadius: radius.sm, marginTop: spacing.md, alignSelf: 'flex-start' },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  payBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.md },
  cancelBtn: { borderColor: palette.alertRed, borderRadius: radius.md },
  actionBtnContent: { height: 48 },
  actionBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  chatModal: { backgroundColor: palette.navyDeep, margin: spacing.md, borderRadius: radius.lg, height: '80%', overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  chatTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16 },
  divider: { backgroundColor: palette.oceanMid },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
  snackbar: { backgroundColor: palette.oceanMid },
});

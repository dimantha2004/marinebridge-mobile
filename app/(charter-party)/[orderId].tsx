import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  TextInput,
  Button,
  ActivityIndicator,
  Snackbar,
  Divider,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useOrderDetail, type LineItemDetail } from '@/hooks/useOrderDetail';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import ServiceCategoryIcon from '@/components/shared/ServiceCategoryIcon';
import { palette, spacing, radius, fonts } from '@/constants/theme';

/** Services that may trigger a charter-clause review (special attention). */
const CLAUSE_SERVICES = ['Bunkering', 'De-bunkering'];

type Decision = 'approve' | 'reject';

function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function supplierLabel(line: LineItemDetail): string | null {
  const profile = line.supplier_mapping?.supplier_profile;
  if (!profile) return null;
  return profile.company_name || profile.full_name || null;
}

export default function CharterOrderDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const { order, lineItems, isLoading, error } = useOrderDetail(orderId);

  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Reset state when orderId changes (safety net for component reuse).
  useEffect(() => {
    setComments('');
    setSubmitting(null);
    setSnackbar(null);
  }, [orderId]);

  // Reset submitting state when screen unmounts (e.g. navigating away mid-request).
  useEffect(() => {
    return () => {
      setSubmitting(null);
    };
  }, []);

  const clauseApplies = useMemo(
    () =>
      lineItems.some((line: LineItemDetail) => {
        const name = line.service_categories?.name ?? '';
        return CLAUSE_SERVICES.includes(name);
      }),
    [lineItems],
  );

  const decided = order != null && order.overall_status !== 'pending_charter_approval';

  async function submitDecision(decision: Decision) {
    if (!orderId || submitting) return;
    setSubmitting(decision);
    try {
      const { error: invokeError } = await supabase.functions.invoke('process-charter-decision', {
        body: {
          order_id: orderId,
          decision: decision === 'approve' ? 'approved' : 'rejected',
          comments: comments.trim() || null,
        },
      });
      if (invokeError) throw invokeError;
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to submit decision.';
      setSnackbar(message);
      setSubmitting(null);
    }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color={palette.fogWhite} onPress={() => router.back()} />
        <Appbar.Content
          title={order?.order_number ?? 'Order'}
          titleStyle={styles.appbarTitle}
        />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error || !order ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load this order.</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {/* Order summary header */}
            <Card style={styles.card} mode="contained">
              <Card.Content>
                <View style={styles.summaryHeader}>
                  <Text style={styles.vessel} numberOfLines={1}>
                    {order.vessel_name}
                  </Text>
                  <OrderStatusBadge status={order.overall_status} />
                </View>
                <SummaryRow icon="finger-print-outline" label="IMO" value={order.imo_number ?? '—'} />
                <SummaryRow icon="location-outline" label="Port" value={order.port?.name ?? '—'} />
                <SummaryRow
                  icon="calendar-outline"
                  label="ETA"
                  value={order.eta ? dayjs(order.eta).format('MMM D, YYYY HH:mm') : '—'}
                />
                <SummaryRow
                  icon="calendar-outline"
                  label="ETD"
                  value={order.etd ? dayjs(order.etd).format('MMM D, YYYY HH:mm') : '—'}
                />
                <SummaryRow
                  icon="person-outline"
                  label="Captain"
                  value={order.captain?.full_name ?? '—'}
                />
              </Card.Content>
            </Card>

            {/* Charter clause alert */}
            {clauseApplies && (
              <View style={styles.clauseBanner}>
                <Ionicons name="alert-circle" size={20} color={palette.navyDeep} />
                <View style={styles.clauseTextWrap}>
                  <Text style={styles.clauseTitle}>Charter clause review may apply</Text>
                  <Text style={styles.clauseBody}>
                    This order includes services (e.g. Bunkering / De-bunkering) that may require
                    special charter-party attention before approval.
                  </Text>
                </View>
              </View>
            )}

            {/* Line items */}
            <Text style={styles.sectionTitle}>Line Items</Text>
            {lineItems.length === 0 ? (
              <Text style={styles.emptyLines}>No line items on this order.</Text>
            ) : (
              lineItems.map((line: LineItemDetail) => {
                const name = line.service_categories?.name ?? 'Service';
                const supplier = supplierLabel(line);
                return (
                  <Card key={line.id} style={styles.lineCard} mode="contained">
                    <Card.Content>
                      <View style={styles.lineHeader}>
                        <View style={styles.lineIcon}>
                          <ServiceCategoryIcon name={name} size={18} color={palette.fogWhite} />
                        </View>
                        <Text style={styles.lineName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.lineTotal}>{formatAmount(line.total_price)}</Text>
                      </View>

                      <View style={styles.lineMetaRow}>
                        <Text style={styles.lineMeta}>
                          Qty: {line.quantity ?? '—'} {line.unit ?? ''}
                        </Text>
                        {line.unit_price != null && (
                          <Text style={styles.lineMeta}>
                            @ {formatAmount(line.unit_price)}
                          </Text>
                        )}
                      </View>

                      {line.specifications ? (
                        <Text style={styles.lineSpec} numberOfLines={3}>
                          {line.specifications}
                        </Text>
                      ) : null}


                    </Card.Content>
                  </Card>
                );
              })
            )}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Order Total</Text>
              <Text style={styles.totalValue}>{formatAmount(order.total_amount)}</Text>
            </View>

            {/* Decision section */}
            {decided ? (
              <View style={styles.decidedBox}>
                <Ionicons name="information-circle-outline" size={18} color={palette.hullGray} />
                <Text style={styles.decidedText}>
                  This order is no longer pending charter approval.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Decision</Text>
                <TextInput
                  mode="outlined"
                  label="Comments (optional)"
                  value={comments}
                  onChangeText={setComments}
                  multiline
                  numberOfLines={4}
                  style={styles.commentInput}
                  outlineColor={palette.hullGray}
                  activeOutlineColor={palette.steelBlue}
                  textColor={palette.fogWhite}
                />

                <View style={styles.actionRow}>
                  <Button
                    mode="contained"
                    onPress={() => submitDecision('reject')}
                    disabled={submitting != null}
                    loading={submitting === 'reject'}
                    style={[styles.actionBtn, { backgroundColor: palette.alertRed }]}
                    labelStyle={styles.actionLabel}
                    icon={() => <Ionicons name="close" size={18} color={palette.fogWhite} />}
                  >
                    Reject
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => submitDecision('approve')}
                    disabled={submitting != null}
                    loading={submitting === 'approve'}
                    style={[styles.actionBtn, { backgroundColor: palette.engineGreen }]}
                    labelStyle={styles.actionLabel}
                    icon={() => <Ionicons name="checkmark" size={18} color={palette.fogWhite} />}
                  >
                    Approve
                  </Button>
                </View>
              </>
            )}
          </ScrollView>

          <Snackbar
            visible={snackbar != null}
            onDismiss={() => setSnackbar(null)}
            duration={4000}
            style={styles.snackbar}
          >
            {snackbar ?? ''}
          </Snackbar>
        </>
      )}
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={15} color={palette.hullGray} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 16 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.md },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  vessel: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18, flexShrink: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs + 2 },
  summaryLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, width: 64 },
  summaryValue: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14, flex: 1 },
  clauseBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: palette.signalAmber,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  clauseTextWrap: { flex: 1 },
  clauseTitle: { fontFamily: fonts.bodySemiBold, color: palette.navyDeep, fontSize: 14 },
  clauseBody: { fontFamily: fonts.body, color: palette.navyDeep, fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  emptyLines: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginBottom: spacing.md },
  lineCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.steelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineName: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15, flex: 1 },
  lineTotal: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 14 },
  lineMetaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  lineMeta: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  lineSpec: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 13, marginTop: spacing.sm },
  lineDivider: { backgroundColor: palette.navyDeep, marginVertical: spacing.sm },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalLabel: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  totalValue: { fontFamily: fonts.display, color: palette.signalAmber, fontSize: 22 },
  commentInput: { backgroundColor: palette.oceanMid, marginBottom: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1, borderRadius: radius.md },
  actionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: palette.fogWhite },
  decidedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  decidedText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, flex: 1 },
  snackbar: { backgroundColor: palette.oceanMid },
});

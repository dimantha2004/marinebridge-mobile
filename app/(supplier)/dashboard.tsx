import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl, Pressable } from 'react-native';
import { Appbar, Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useSupplierOrders, type SupplierLineItem } from '@/hooks/useSupplierOrders';
import { useNotifications } from '@/hooks/useNotifications';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import NotificationBell from '@/components/shared/NotificationBell';
import { LINE_STATUS_META, type LineStatus } from '@/constants/orderStatuses';
import { palette, spacing, radius, fonts } from '@/constants/theme';

// Line statuses considered "active" work for a supplier (terminal ones excluded).
const ACTIVE_STATUSES: LineStatus[] = [
  'pending_supplier',
  'supplier_accepted',
  'preparing',
  'ready',
  'in_transit',
];

export default function SupplierDashboard() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { data, isLoading, error, refetch } = useSupplierOrders(userId);
  const { unreadCount } = useNotifications(userId);

  const active = useMemo(
    () => data.filter((li: SupplierLineItem) => ACTIVE_STATUSES.includes(li.line_status as LineStatus)),
    [data],
  );

  const grouped = useMemo(() => {
    const map = new Map<LineStatus, SupplierLineItem[]>();
    for (const status of ACTIVE_STATUSES) map.set(status, []);
    for (const li of active) {
      const key = li.line_status as LineStatus;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(li);
    }
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [active]);

  const pendingCount = active.filter((li: SupplierLineItem) => li.line_status === 'pending_supplier').length;

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Supplier" titleStyle={styles.appbarTitle} />
        <NotificationBell count={unreadCount} onPress={() => router.push('/(supplier)/orders')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load your assignments.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={palette.steelBlue} />
          }
        >
          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{active.length}</Text>
              <Text style={styles.summaryLabel}>Active Lines</Text>
            </View>
            <View style={[styles.summaryCard, styles.summaryAmber]}>
              <Text style={styles.summaryNumber}>{pendingCount}</Text>
              <Text style={styles.summaryLabel}>Awaiting You</Text>
            </View>
          </View>

          {grouped.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-outline" size={40} color={palette.hullGray} />
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyText}>
                You have no active assignments right now.
              </Text>
            </View>
          ) : (
            grouped.map(([status, items]) => (
              <View key={status} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View
                    style={[styles.groupDot, { backgroundColor: LINE_STATUS_META[status].color }]}
                  />
                  <Text style={styles.groupTitle}>{LINE_STATUS_META[status].label}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{items.length}</Text>
                  </View>
                </View>

                {items.map((li) => (
                  <Pressable
                    key={li.id}
                    style={styles.itemCard}
                    onPress={() =>
                      li.order?.id &&
                      router.push(`/(supplier)/orders/${li.order.id}`)
                    }
                  >
                    <View style={styles.itemIcon}>
                      <Ionicons
                        name={
                          (li.service_categories?.icon_name ??
                            'cube') as keyof typeof Ionicons.glyphMap
                        }
                        size={22}
                        color={palette.steelBlue}
                      />
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemService} numberOfLines={1}>
                        {li.service_categories?.name ?? 'Service'}
                      </Text>
                      <Text style={styles.itemVessel} numberOfLines={1}>
                        {li.order?.vessel_name ?? 'Vessel'} ·{' '}
                        {li.order?.port?.name ?? 'Port'}
                      </Text>
                      {li.order?.eta ? (
                        <Text style={styles.itemEta}>
                          ETA {dayjs(li.order.eta).format('MMM D, HH:mm')}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={palette.hullGray}
                    />
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryAmber: { borderLeftWidth: 3, borderLeftColor: palette.signalAmber },
  summaryNumber: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 28 },
  summaryLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  group: { marginBottom: spacing.lg },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  groupDot: { width: 9, height: 9, borderRadius: radius.pill },
  groupTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: palette.oceanMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 11 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1 },
  itemService: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  itemVessel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  itemEta: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 11, marginTop: 2 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

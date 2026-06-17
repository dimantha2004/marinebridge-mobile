import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  ActivityIndicator,
  TouchableRipple,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { useNotifications } from '@/hooks/useNotifications';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import NotificationBell from '@/components/shared/NotificationBell';
import type { Order } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const AWAITING_STATUS = 'pending_port_approval';
const ACTIVE_STATUSES = ['active', 'in_execution'];

export default function PortAuthorityDashboard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  // RLS restricts visibility to orders whose port carries PA-approval services.
  const { data: orders, isLoading, error, refetch } = useOrders('port_authority', userId);
  const { unreadCount } = useNotifications(userId);

  const counts = useMemo(() => {
    let awaiting = 0;
    let active = 0;
    let completed = 0;
    for (const o of orders) {
      if (o.overall_status === AWAITING_STATUS) awaiting += 1;
      else if (ACTIVE_STATUSES.includes(o.overall_status)) active += 1;
      else if (o.overall_status === 'completed') completed += 1;
    }
    return { awaiting, active, completed };
  }, [orders]);

  const recent = useMemo(() => orders.slice(0, 15), [orders]);

  const greeting = profile?.full_name ? profile.full_name.split(' ')[0] : 'Officer';

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Port Authority" titleStyle={styles.appbarTitle} />
        <NotificationBell
          count={unreadCount}
          onPress={() => router.push('/(captain)/notifications')}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Oversight for</Text>
        <Text style={styles.name}>{greeting}</Text>

        <View style={styles.summaryRow}>
          <SummaryCard
            label="Awaiting"
            value={counts.awaiting}
            color={palette.signalAmber}
            icon="hourglass"
          />
          <SummaryCard
            label="Active"
            value={counts.active}
            color={palette.steelBlue}
            icon="boat"
          />
          <SummaryCard
            label="Completed"
            value={counts.completed}
            color={palette.engineGreen}
            icon="checkmark-done"
          />
        </View>

        {counts.awaiting > 0 ? (
          <TouchableRipple
            onPress={() => router.push('/(port-authority)/approvals')}
            style={styles.cta}
            borderless
          >
            <View style={styles.ctaInner}>
              <Ionicons name="shield-checkmark" size={20} color={palette.navyDeep} />
              <Text style={styles.ctaText}>
                {counts.awaiting} order{counts.awaiting === 1 ? '' : 's'} awaiting your sign-off
              </Text>
              <Ionicons name="chevron-forward" size={18} color={palette.navyDeep} />
            </View>
          </TouchableRipple>
        ) : null}

        <Text style={styles.sectionTitle}>Recent Orders ({recent.length})</Text>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={palette.steelBlue} />
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
            <Text style={styles.stateText}>Couldn't load orders.</Text>
          </View>
        ) : recent.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="boat-outline" size={32} color={palette.hullGray} />
            <Text style={styles.stateText}>No orders at your ports yet.</Text>
          </View>
        ) : (
          recent.map((order: Order) => (
            <RecentOrderCard
              key={order.id}
              order={order}
              onPress={() => router.push('/(port-authority)/approvals')}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Card style={styles.summaryCard} mode="contained">
      <Card.Content style={styles.summaryCardContent}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

function RecentOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <Card style={styles.orderCard} mode="contained">
      <TouchableRipple onPress={onPress} borderless style={styles.ripple}>
        <Card.Content style={styles.orderCardContent}>
          <View style={styles.orderHeader}>
            <View style={styles.orderHeaderInfo}>
              <Text style={styles.orderNumber}>{order.order_number ?? 'Draft'}</Text>
              <Text style={styles.orderVessel} numberOfLines={1}>
                {order.vessel_name}
              </Text>
              <Text style={styles.orderDate}>
                {order.eta
                  ? `ETA ${dayjs(order.eta).format('MMM D, HH:mm')}`
                  : dayjs(order.created_at).format('MMM D, YYYY')}
              </Text>
            </View>
            <OrderStatusBadge status={order.overall_status} />
          </View>
        </Card.Content>
      </TouchableRipple>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  greeting: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 15 },
  name: {
    fontFamily: fonts.display,
    color: palette.fogWhite,
    fontSize: 26,
    marginBottom: spacing.lg,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, backgroundColor: palette.oceanMid, borderRadius: radius.md },
  summaryCardContent: { alignItems: 'center', paddingVertical: spacing.sm },
  summaryValue: { fontFamily: fonts.display, fontSize: 24, marginTop: spacing.xs },
  summaryLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  cta: {
    backgroundColor: palette.signalAmber,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  ctaText: { flex: 1, fontFamily: fonts.bodySemiBold, color: palette.navyDeep, fontSize: 14 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  stateBox: { alignItems: 'center', paddingVertical: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  orderCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  ripple: { borderRadius: radius.md },
  orderCardContent: { paddingVertical: spacing.md },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  orderHeaderInfo: { flex: 1, minWidth: 0 },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  orderVessel: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginTop: 2,
  },
  orderDate: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
});

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, ActivityIndicator, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { useNotifications } from '@/hooks/useNotifications';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import NotificationBell from '@/components/shared/NotificationBell';
import TimelineTracker from '@/components/shared/TimelineTracker';
import type { Order } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const ACTIVE_STATUSES = ['active', 'in_execution', 'pending_port_approval'];
const PENDING_STATUSES = ['pending_charter_approval', 'pending_payment', 'draft'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'charter_rejected'];

export default function ShipAgentHub() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { data: orders, isLoading, error } = useOrders('ship_agent', userId);
  const { unreadCount } = useNotifications(userId);

  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let completed = 0;
    for (const o of orders) {
      if (ACTIVE_STATUSES.includes(o.overall_status)) active += 1;
      else if (PENDING_STATUSES.includes(o.overall_status)) pending += 1;
      else if (o.overall_status === 'completed') completed += 1;
    }
    return { active, pending, completed };
  }, [orders]);

  const activeOrders = useMemo(
    () => orders.filter((o: Order) => !TERMINAL_STATUSES.includes(o.overall_status)),
    [orders],
  );

  const greeting = profile?.full_name ? profile.full_name.split(' ')[0] : 'Agent';

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Coordination Hub" titleStyle={styles.appbarTitle} />
        <NotificationBell
          count={unreadCount}
          onPress={() => router.push('/(captain)/notifications')}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Managing vessels for</Text>
        <Text style={styles.name}>{greeting}</Text>

        <View style={styles.summaryRow}>
          <SummaryCard label="Active" value={counts.active} color={palette.steelBlue} icon="boat" />
          <SummaryCard label="Pending" value={counts.pending} color={palette.signalAmber} icon="time" />
          <SummaryCard label="Completed" value={counts.completed} color={palette.engineGreen} icon="checkmark-done" />
        </View>

        <Text style={styles.sectionTitle}>Active Coordination ({activeOrders.length})</Text>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={palette.steelBlue} />
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
            <Text style={styles.stateText}>Couldn't load orders.</Text>
          </View>
        ) : activeOrders.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="boat-outline" size={32} color={palette.hullGray} />
            <Text style={styles.stateText}>No active orders to coordinate.</Text>
          </View>
        ) : (
          activeOrders.map((order: Order) => (
            <ActiveOrderCard
              key={order.id}
              order={order}
              onPress={() => router.push(`/(ship-agent)/orders/${order.id}`)}
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

function ActiveOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <TouchableRipple onPress={onPress} style={styles.orderCard}>
      <View style={styles.orderCardInner}>
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
        <View style={styles.timelineWrap}>
          <TimelineTracker current={order.overall_status} />
        </View>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  greeting: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 15 },
  name: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 26, marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, backgroundColor: palette.oceanMid, borderRadius: radius.md },
  summaryCardContent: { alignItems: 'center', paddingVertical: spacing.sm },
  summaryValue: { fontFamily: fonts.display, fontSize: 24, marginTop: spacing.xs },
  summaryLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginBottom: spacing.sm },
  stateBox: { alignItems: 'center', paddingVertical: spacing.xl },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  orderCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  orderCardInner: { padding: spacing.md },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  orderHeaderInfo: { flex: 1, minWidth: 0 },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  orderVessel: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginTop: 2 },
  orderDate: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  timelineWrap: { marginTop: spacing.xs },
});

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Text, ActivityIndicator, TouchableRipple } from 'react-native-paper';
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

const ACTIVE_STATUSES = ['active', 'in_execution', 'pending_port_approval'];
const PENDING_STATUSES = ['pending_charter_approval', 'pending_payment', 'draft'];

export default function CaptainDashboard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { data: orders, isLoading, error } = useOrders('captain', userId);
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

  const recent = orders.slice(0, 5);
  const greeting = profile?.full_name ? profile.full_name.split(' ')[0] : 'Captain';

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Marianbridge" titleStyle={styles.appbarTitle} />
        <NotificationBell count={unreadCount} onPress={() => router.push('/(captain)/notifications')} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Welcome aboard,</Text>
        <Text style={styles.name}>{greeting}</Text>

        <Button
          mode="contained"
          icon={() => <Ionicons name="add-circle" size={20} color={palette.fogWhite} />}
          style={styles.cta}
          contentStyle={styles.ctaContent}
          labelStyle={styles.ctaLabel}
          onPress={() => router.push('/(captain)/new-order')}
        >
          New Order
        </Button>

        <View style={styles.summaryRow}>
          <SummaryCard label="Active" value={counts.active} color={palette.steelBlue} icon="boat" />
          <SummaryCard label="Pending" value={counts.pending} color={palette.signalAmber} icon="time" />
          <SummaryCard label="Completed" value={counts.completed} color={palette.engineGreen} icon="checkmark-done" />
        </View>

        <Text style={styles.sectionTitle}>Recent Orders</Text>

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
            <Ionicons name="clipboard-outline" size={32} color={palette.hullGray} />
            <Text style={styles.stateText}>No orders yet. Create your first order.</Text>
          </View>
        ) : (
          recent.map((order: Order) => <RecentOrderRow key={order.id} order={order} onPress={() => router.push(`/(captain)/orders/${order.id}`)} />)
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap }) {
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

function RecentOrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <TouchableRipple onPress={onPress} style={styles.orderRow}>
      <View style={styles.orderRowInner}>
        <View style={styles.orderRowInfo}>
          <Text style={styles.orderNumber}>{order.order_number ?? 'Draft'}</Text>
          <Text style={styles.orderVessel} numberOfLines={1}>{order.vessel_name}</Text>
          <Text style={styles.orderDate}>{dayjs(order.created_at).format('MMM D, YYYY')}</Text>
        </View>
        <OrderStatusBadge status={order.overall_status} />
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
  cta: { backgroundColor: palette.steelBlue, borderRadius: radius.md, marginBottom: spacing.lg },
  ctaContent: { height: 54 },
  ctaLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, backgroundColor: palette.oceanMid, borderRadius: radius.md },
  summaryCardContent: { alignItems: 'center', paddingVertical: spacing.sm },
  summaryValue: { fontFamily: fonts.display, fontSize: 24, marginTop: spacing.xs },
  summaryLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginBottom: spacing.sm },
  stateBox: { alignItems: 'center', paddingVertical: spacing.xl },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  orderRow: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  orderRowInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  orderRowInfo: { flex: 1, minWidth: 0 },
  orderNumber: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 14 },
  orderVessel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15, marginTop: 2 },
  orderDate: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
});

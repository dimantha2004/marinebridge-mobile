import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import type { Order } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

function formatAmount(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CharterHistoryScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { data: orders, isLoading, error, refetch } = useOrders('charter_party', userId);

  const decided = useMemo(
    () => orders.filter((o: Order) => o.overall_status !== 'pending_charter_approval'),
    [orders],
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Decision History" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load history.</Text>
        </View>
      ) : decided.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="archive-outline" size={36} color={palette.hullGray} />
          <Text style={styles.stateText}>No past decisions yet.</Text>
        </View>
      ) : (
        <FlatList
          data={decided}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          onRefresh={refetch}
          refreshing={false}
          renderItem={({ item }) => (
            <HistoryCard
              order={item}
              onPress={() => router.push(`/(charter-party)/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function HistoryCard({ order, onPress }: { order: Order; onPress: () => void }) {
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
            <Text style={styles.amount}>{formatAmount(order.total_amount)}</Text>
          </View>

          <Text style={styles.date}>
            Updated {dayjs(order.updated_at).format('MMM D, YYYY HH:mm')}
          </Text>

          {order.charter_comments ? (
            <View style={styles.commentBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={palette.hullGray} />
              <Text style={styles.commentText} numberOfLines={3}>
                {order.charter_comments}
              </Text>
            </View>
          ) : null}
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
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, marginTop: spacing.xs },
  metaText: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14, flex: 1 },
  amount: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 13 },
  date: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: spacing.xs },
  commentBox: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    backgroundColor: palette.navyDeep,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  commentText: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 13, flex: 1 },
});

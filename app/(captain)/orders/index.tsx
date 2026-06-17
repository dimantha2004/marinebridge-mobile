import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Text, ActivityIndicator, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import type { Order } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export default function OrdersList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { data: orders, isLoading, error, refetch } = useOrders('captain', userId);

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="My Orders" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load your orders.</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="clipboard-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>No orders yet.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <OrderRow order={item} onPress={() => router.push(`/(captain)/orders/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <TouchableRipple onPress={onPress} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={styles.rowInfo}>
          <Text style={styles.orderNumber}>{order.order_number ?? 'Draft'}</Text>
          <Text style={styles.vessel} numberOfLines={1}>{order.vessel_name}</Text>
          <Text style={styles.date}>{dayjs(order.created_at).format('MMM D, YYYY · HH:mm')}</Text>
        </View>
        <View style={styles.rowRight}>
          <OrderStatusBadge status={order.overall_status} />
          {order.total_amount != null ? (
            <Text style={styles.amount}>${order.total_amount.toFixed(2)}</Text>
          ) : null}
        </View>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  list: { padding: spacing.md },
  row: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  rowInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowInfo: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  orderNumber: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 14 },
  vessel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15, marginTop: 2 },
  date: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  amount: { fontFamily: fonts.mono, color: palette.engineGreen, fontSize: 13 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
});

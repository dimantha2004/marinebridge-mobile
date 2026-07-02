import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, RefreshControl, Pressable } from 'react-native';
import { Appbar, Text, ActivityIndicator, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useSupplierOrders, type SupplierLineItem } from '@/hooks/useSupplierOrders';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export default function SupplierOrders() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { data, isLoading, error, refetch } = useSupplierOrders(userId);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((li: SupplierLineItem) => {
      const haystack = [
        li.service_categories?.name,
        li.order?.vessel_name,
        li.order?.port?.name,
        li.order?.order_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, query]);

  const renderItem = ({ item: li }: { item: SupplierLineItem }) => (
    <Pressable
      style={styles.card}
      onPress={() => li.order?.id && router.push(`/(supplier)/orders/${li.order.id}`)}
    >
      <View style={styles.cardTop}>
        <View style={styles.itemIcon}>
          <Ionicons
            name={(li.service_categories?.icon_name ?? 'cube') as keyof typeof Ionicons.glyphMap}
            size={22}
            color={palette.steelBlue}
          />
        </View>
        <View style={styles.cardHead}>
          <Text style={styles.service} numberOfLines={1}>
            {li.service_categories?.name ?? 'Service'}
          </Text>
          {li.order?.order_number ? (
            <Text style={styles.orderNumber}>{li.order.order_number}</Text>
          ) : null}
        </View>
        <OrderStatusBadge status={li.line_status} kind="line" />
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="boat-outline" size={14} color={palette.hullGray} />
        <Text style={styles.metaText} numberOfLines={1}>
          {li.order?.vessel_name ?? 'Vessel'}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={14} color={palette.hullGray} />
        <Text style={styles.metaText} numberOfLines={1}>
          {li.order?.port?.name ?? 'Port'}
        </Text>
        {li.order?.eta ? (
          <>
            <Ionicons
              name="time-outline"
              size={14}
              color={palette.hullGray}
              style={styles.metaIconGap}
            />
            <Text style={styles.metaText}>ETA {dayjs(li.order.eta).format('MMM D, HH:mm')}</Text>
          </>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
        {li.quantity != null ? (
          <View style={[styles.metaRow, { marginTop: 0 }]}>
            <Ionicons name="cube-outline" size={14} color={palette.hullGray} />
            <Text style={styles.metaText}>
              {li.quantity} {li.unit ?? ''}
            </Text>
          </View>
        ) : <View />}
        <Ionicons name="chatbubbles-outline" size={22} color={palette.steelBlue} style={{ marginRight: spacing.xs }} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="My Orders" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <Searchbar
        placeholder="Search vessel, port, service…"
        value={query}
        onChangeText={setQuery}
        style={styles.search}
        inputStyle={styles.searchInput}
        iconColor={palette.hullGray}
        placeholderTextColor={palette.hullGray}
      />

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load your orders.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(li) => li.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={palette.steelBlue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={40} color={palette.hullGray} />
              <Text style={styles.emptyTitle}>No assigned lines</Text>
              <Text style={styles.emptyText}>
                {query ? 'No results match your search.' : 'Assignments will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  search: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
  },
  searchInput: { color: palette.fogWhite, fontFamily: fonts.body },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
  listContent: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHead: { flex: 1 },
  service: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  metaIconGap: { marginLeft: spacing.sm },
  metaText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, flexShrink: 1 },
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

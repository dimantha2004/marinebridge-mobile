import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Text, ActivityIndicator, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/authStore';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import type { Notification, NotificationType } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  approval_request: 'shield-checkmark-outline',
  order_update: 'cube-outline',
  message: 'chatbubble-ellipses-outline',
  system: 'information-circle-outline',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { data: notifications, isLoading, error, refetch } = useNotifications(userId);
  const markRead = useMarkNotificationRead();

  const handlePress = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.order_id) router.push(`/(captain)/orders/${n.order_id}`);
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Notifications" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load notifications.</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="notifications-off-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>You're all caught up.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => <NotificationRow notification={item} onPress={() => handlePress(item)} />}
        />
      )}
    </View>
  );
}

function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const icon = TYPE_ICON[(notification.type ?? 'system') as NotificationType] ?? 'information-circle-outline';
  return (
    <TouchableRipple onPress={onPress} style={[styles.row, !notification.read && styles.rowUnread]}>
      <View style={styles.rowInner}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={palette.steelBlue} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{notification.title ?? 'Notification'}</Text>
          {notification.body ? <Text style={styles.body} numberOfLines={2}>{notification.body}</Text> : null}
          <Text style={styles.date}>{dayjs(notification.created_at).format('MMM D, YYYY · HH:mm')}</Text>
        </View>
        {!notification.read ? <View style={styles.unreadDot} /> : null}
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
  rowUnread: { borderLeftWidth: 3, borderLeftColor: palette.steelBlue },
  rowInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  iconWrap: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: palette.navyDeep, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  body: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  date: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 11, marginTop: spacing.xs },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: palette.steelBlue },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
});

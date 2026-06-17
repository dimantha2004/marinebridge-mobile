import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { palette, radius, fonts } from '@/constants/theme';

export type NotificationBellProps = {
  count: number;
  onPress: () => void;
};

export default function NotificationBell({ count, onPress }: NotificationBellProps) {
  const hasUnread = count > 0;
  const display = count > 99 ? '99+' : String(count);

  return (
    <View style={styles.wrap}>
      <Appbar.Action
        icon={() => (
          <Ionicons
            name={hasUnread ? 'notifications' : 'notifications-outline'}
            size={24}
            color={palette.fogWhite}
          />
        )}
        onPress={onPress}
        accessibilityLabel={
          hasUnread ? `Notifications, ${count} unread` : 'Notifications'
        }
      />
      {hasUnread ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{display}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: palette.fogWhite,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
});

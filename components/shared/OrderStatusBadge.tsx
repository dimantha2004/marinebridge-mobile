import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import {
  OVERALL_STATUS_META,
  LINE_STATUS_META,
  type OverallStatus,
  type LineStatus,
} from '@/constants/orderStatuses';
import { palette, radius, spacing, fonts } from '@/constants/theme';

type StatusMeta = { label: string; color: string; pulsing?: boolean };

export type OrderStatusBadgeProps = {
  status: OverallStatus | LineStatus;
  kind?: 'overall' | 'line';
};

function PulsingDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
}

export default function OrderStatusBadge({ status, kind = 'overall' }: OrderStatusBadgeProps) {
  const meta: StatusMeta | undefined =
    kind === 'line'
      ? LINE_STATUS_META[status as LineStatus]
      : OVERALL_STATUS_META[status as OverallStatus];

  const resolved: StatusMeta = meta ?? { label: String(status), color: palette.hullGray };

  return (
    <View style={[styles.badge, { backgroundColor: resolved.color }]}>
      {resolved.pulsing ? <PulsingDot color={palette.fogWhite} /> : null}
      <Text style={styles.label} numberOfLines={1}>
        {resolved.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    marginRight: spacing.xs + 2,
  },
  label: {
    color: palette.fogWhite,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});

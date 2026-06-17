import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_STEPPER, type OverallStatus } from '@/constants/orderStatuses';
import { palette, radius, spacing, fonts } from '@/constants/theme';

export type TimelineTrackerProps = {
  current: OverallStatus;
};

/**
 * Maps an OverallStatus onto the canonical ORDER_STEPPER index.
 * Statuses not literally present in the stepper are folded onto the
 * nearest meaningful step.
 */
const STATUS_TO_STEP_KEY: Record<OverallStatus, OverallStatus | null> = {
  draft: 'draft',
  pending_charter_approval: 'pending_charter_approval',
  charter_rejected: null, // terminal — handled separately
  pending_payment: 'pending_payment',
  pending_port_approval: 'active',
  active: 'active',
  in_execution: 'in_execution',
  completed: 'completed',
  cancelled: null, // terminal — handled separately
};

function PulsingRing({ children }: { children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

function TerminalState({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.terminalWrap}>
      <View style={[styles.terminalBadge, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color={palette.fogWhite} />
        <Text style={styles.terminalLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function TimelineTracker({ current }: TimelineTrackerProps) {
  if (current === 'charter_rejected') {
    return <TerminalState label="Charter Rejected" color={palette.alertRed} icon="close-circle" />;
  }
  if (current === 'cancelled') {
    return <TerminalState label="Order Cancelled" color={palette.alertRed} icon="ban" />;
  }

  const activeKey = STATUS_TO_STEP_KEY[current] ?? 'draft';
  const currentIndex = ORDER_STEPPER.findIndex((s) => s.key === activeKey);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {ORDER_STEPPER.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const nodeColor = isCompleted
          ? palette.engineGreen
          : isCurrent
            ? palette.steelBlue
            : palette.hullGray;
        const connectorColor = index < currentIndex ? palette.engineGreen : palette.hullGray;

        const node = (
          <View style={[styles.node, { backgroundColor: nodeColor }]}>
            {isCompleted ? (
              <Ionicons name="checkmark" size={16} color={palette.fogWhite} />
            ) : (
              <Text style={styles.nodeIndex}>{index + 1}</Text>
            )}
          </View>
        );

        return (
          <View key={step.key} style={styles.step}>
            <View style={styles.row}>
              {index > 0 ? (
                <View style={[styles.connector, { backgroundColor: connectorColor }]} />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
              {isCurrent ? <PulsingRing>{node}</PulsingRing> : node}
              {index < ORDER_STEPPER.length - 1 ? (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        index < currentIndex ? palette.engineGreen : palette.hullGray,
                    },
                  ]}
                />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
            </View>
            <Text
              style={[
                styles.label,
                isCurrent && styles.labelCurrent,
                isCompleted && styles.labelCompleted,
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const NODE_SIZE = 32;

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
  },
  step: {
    width: 92,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  connector: {
    flex: 1,
    height: 3,
    borderRadius: radius.sm,
  },
  connectorSpacer: {
    flex: 1,
    height: 3,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeIndex: {
    color: palette.fogWhite,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  label: {
    marginTop: spacing.xs + 2,
    color: palette.hullGray,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textAlign: 'center',
  },
  labelCurrent: {
    color: palette.steelBlue,
    fontFamily: fonts.bodySemiBold,
  },
  labelCompleted: {
    color: palette.engineGreen,
  },
  terminalWrap: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  terminalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  terminalLabel: {
    color: palette.fogWhite,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    marginLeft: spacing.sm,
  },
});

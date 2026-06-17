import React from 'react';
import { StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { palette, fonts } from '@/constants/theme';

export type SupplierAssignedBadgeProps = {
  supplierName?: string | null;
};

export default function SupplierAssignedBadge({ supplierName }: SupplierAssignedBadgeProps) {
  const assigned = !!supplierName;
  const label = assigned ? (supplierName as string) : 'Unassigned';
  const color = assigned ? palette.steelBlue : palette.hullGray;
  const icon = assigned ? 'business' : 'help-circle-outline';

  return (
    <Chip
      compact
      style={[styles.chip, { backgroundColor: color }]}
      textStyle={styles.text}
      icon={() => <Ionicons name={icon} size={13} color={palette.fogWhite} />}
    >
      {label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', height: 26 },
  text: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 11, lineHeight: 14 },
});

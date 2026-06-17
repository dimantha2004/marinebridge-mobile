import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, IconButton, Text } from 'react-native-paper';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import type { OrderDocument } from '@/types/database';
import { palette, radius, spacing, fonts } from '@/constants/theme';

export type DocumentCardProps = {
  document: OrderDocument;
  onOpen?: (doc: OrderDocument) => void;
};

const DOC_TYPE_COLOR: Record<string, string> = {
  invoice: palette.signalAmber,
  delivery_note: palette.steelBlue,
  certificate: palette.engineGreen,
  approval_doc: palette.oceanMid,
  other: palette.hullGray,
};

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  delivery_note: 'Delivery Note',
  certificate: 'Certificate',
  approval_doc: 'Approval Doc',
  other: 'Other',
};

export default function DocumentCard({ document, onOpen }: DocumentCardProps) {
  const docType = document.document_type ?? 'other';
  const chipColor = DOC_TYPE_COLOR[docType] ?? palette.hullGray;
  const chipLabel = DOC_TYPE_LABEL[docType] ?? docType;
  const fileName = document.file_name ?? 'Untitled document';
  const created = document.created_at ? dayjs(document.created_at).format('MMM D, YYYY · HH:mm') : '';

  return (
    <Card style={styles.card} mode="contained">
      <Card.Content style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text" size={22} color={palette.fogWhite} />
        </View>

        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          <View style={styles.metaRow}>
            <Chip
              compact
              style={[styles.chip, { backgroundColor: chipColor }]}
              textStyle={styles.chipText}
            >
              {chipLabel}
            </Chip>
            {created ? <Text style={styles.date}>{created}</Text> : null}
          </View>
        </View>

        <IconButton
          icon={() => <Ionicons name="download-outline" size={22} color={palette.steelBlue} />}
          onPress={() => onOpen?.(document)}
          accessibilityLabel={`Open ${fileName}`}
        />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: palette.fogWhite,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  chip: {
    marginRight: spacing.sm,
    height: 24,
  },
  chipText: {
    color: palette.fogWhite,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    marginVertical: 0,
  },
  date: {
    color: palette.hullGray,
    fontFamily: fonts.body,
    fontSize: 12,
  },
});

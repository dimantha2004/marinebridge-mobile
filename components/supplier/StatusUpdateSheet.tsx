import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Portal,
  Modal,
  Text,
  Button,
  TextInput,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateLineStatus } from '@/hooks/useSupplierOrders';
import {
  SUPPLIER_NEXT_ACTIONS,
  LINE_STATUS_META,
  type LineStatus,
} from '@/constants/orderStatuses';
import type { OrderLineItem } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export type StatusUpdateConfirmOpts = {
  declineReason?: string | null;
  requiresDocument?: boolean;
};

export type StatusUpdateSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  lineItem: Pick<OrderLineItem, 'id' | 'line_status'> | null;
  /** Whether a delivery document has already been uploaded for this line item. */
  hasDocument?: boolean;
  onConfirm?: (nextStatus: LineStatus, opts: StatusUpdateConfirmOpts) => void;
};

export default function StatusUpdateSheet({
  visible,
  onDismiss,
  lineItem,
  hasDocument = false,
  onConfirm,
}: StatusUpdateSheetProps) {
  const updateStatus = useUpdateLineStatus();

  const actions = useMemo(() => {
    if (!lineItem) return [];
    return SUPPLIER_NEXT_ACTIONS[lineItem.line_status as LineStatus] ?? [];
  }, [lineItem]);

  const [selected, setSelected] = useState<LineStatus | null>(null);
  const [reason, setReason] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Reset transient state whenever the sheet opens/closes or the line changes.
  useEffect(() => {
    if (visible) {
      setSelected(actions.length === 1 ? actions[0].next : null);
      setReason('');
      setErrorText(null);
    }
  }, [visible, actions]);

  const selectedAction = actions.find((a) => a.next === selected) ?? null;
  const isDecline = selected === 'supplier_declined';
  const needsDocument = !!selectedAction?.requiresDocument;

  const handleConfirm = () => {
    if (!lineItem || !selected) {
      setErrorText('Choose an action to continue.');
      return;
    }
    if (isDecline && reason.trim().length < 3) {
      setErrorText('Please provide a decline reason.');
      return;
    }
    if (needsDocument && !hasDocument) {
      setErrorText('Upload a delivery document before marking as delivered.');
      return;
    }

    const opts: StatusUpdateConfirmOpts = {
      declineReason: isDecline ? reason.trim() : null,
      requiresDocument: needsDocument,
    };

    updateStatus.mutate(
      {
        lineItemId: lineItem.id,
        lineStatus: selected,
        declineReason: opts.declineReason,
      },
      {
        onSuccess: () => {
          onConfirm?.(selected, opts);
          onDismiss();
        },
        onError: (err) => setErrorText(err.message),
      },
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.sheet}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>Update Status</Text>
        {lineItem ? (
          <Text style={styles.subtitle}>
            Currently {LINE_STATUS_META[lineItem.line_status as LineStatus]?.label ?? lineItem.line_status}
          </Text>
        ) : null}

        <Divider style={styles.divider} />

        {actions.length === 0 ? (
          <View style={styles.noActions}>
            <Ionicons name="lock-closed-outline" size={24} color={palette.hullGray} />
            <Text style={styles.noActionsText}>No further actions available.</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {actions.map((action) => {
              const isSel = selected === action.next;
              const declineStyle = action.next === 'supplier_declined';
              return (
                <Button
                  key={action.next}
                  mode={isSel ? 'contained' : 'outlined'}
                  onPress={() => {
                    setSelected(action.next);
                    setErrorText(null);
                  }}
                  buttonColor={
                    isSel
                      ? declineStyle
                        ? palette.alertRed
                        : palette.steelBlue
                      : undefined
                  }
                  textColor={
                    isSel
                      ? palette.fogWhite
                      : declineStyle
                        ? palette.alertRed
                        : palette.steelBlue
                  }
                  style={[
                    styles.actionBtn,
                    { borderColor: declineStyle ? palette.alertRed : palette.steelBlue },
                  ]}
                  labelStyle={styles.actionLabel}
                >
                  {action.label}
                </Button>
              );
            })}
          </View>
        )}

        {isDecline ? (
          <TextInput
            mode="outlined"
            label="Decline reason"
            value={reason}
            onChangeText={(t) => {
              setReason(t);
              setErrorText(null);
            }}
            multiline
            numberOfLines={3}
            style={styles.reasonInput}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.alertRed}
            textColor={palette.fogWhite}
          />
        ) : null}

        {needsDocument ? (
          <View style={[styles.docNotice, hasDocument ? styles.docOk : styles.docMissing]}>
            <Ionicons
              name={hasDocument ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={hasDocument ? palette.engineGreen : palette.signalAmber}
            />
            <Text style={styles.docNoticeText}>
              {hasDocument
                ? 'Delivery document attached.'
                : 'A delivery document must be uploaded first.'}
            </Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.footer}>
          <Button
            mode="text"
            textColor={palette.hullGray}
            onPress={onDismiss}
            disabled={updateStatus.isPending}
          >
            Cancel
          </Button>
          {actions.length > 0 ? (
            <Button
              mode="contained"
              buttonColor={isDecline ? palette.alertRed : palette.steelBlue}
              textColor={palette.fogWhite}
              onPress={handleConfirm}
              disabled={updateStatus.isPending || !selected}
              style={styles.confirmBtn}
            >
              {updateStatus.isPending ? (
                <ActivityIndicator size={16} color={palette.fogWhite} />
              ) : (
                'Confirm'
              )}
            </Button>
          ) : null}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: palette.navyDeep,
    marginHorizontal: spacing.md,
    marginTop: 'auto',
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.hullGray,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  subtitle: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  divider: { backgroundColor: palette.oceanMid, marginVertical: spacing.md },
  actions: { gap: spacing.sm },
  actionBtn: { borderRadius: radius.sm },
  actionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  noActions: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  noActionsText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14 },
  reasonInput: { marginTop: spacing.md, backgroundColor: palette.oceanMid },
  docNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  docOk: { backgroundColor: 'rgba(16,185,129,0.12)' },
  docMissing: { backgroundColor: 'rgba(245,158,11,0.12)' },
  docNoticeText: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 13, flexShrink: 1 },
  errorText: {
    fontFamily: fonts.bodyMedium,
    color: palette.alertRed,
    fontSize: 13,
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  confirmBtn: { borderRadius: radius.sm, minWidth: 110 },
});

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Linking } from 'react-native';
import {
  Appbar,
  Text,
  Button,
  ActivityIndicator,
  Divider,
  Portal,
  Modal,
  Snackbar,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSupplierOrders, type SupplierLineItem } from '@/hooks/useSupplierOrders';
import { useOrderDocuments } from '@/hooks/useOrderDetail';
import { uploadOrderDocument, getSignedUrl } from '@/lib/storage';
import OrderStatusBadge from '@/components/shared/OrderStatusBadge';
import DocumentCard from '@/components/shared/DocumentCard';
import MessageThread from '@/components/shared/MessageThread';
import StatusUpdateSheet from '@/components/supplier/StatusUpdateSheet';
import { SUPPLIER_NEXT_ACTIONS, type LineStatus } from '@/constants/orderStatuses';
import type { OrderDocument } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const DOC_PICKER_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function SupplierOrderDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : null;
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useSupplierOrders(userId);
  const {
    data: documents,
    refetch: refetchDocs,
  } = useOrderDocuments(orderId);

  // Only the line item(s) on THIS order assigned to this supplier (RLS-scoped).
  const myLines = useMemo<SupplierLineItem[]>(
    () => data.filter((li: SupplierLineItem) => li.order?.id === orderId),
    [data, orderId],
  );
  const orderContext = myLines[0]?.order ?? null;

  const [sheetLine, setSheetLine] = useState<SupplierLineItem | null>(null);
  const [chatLine, setChatLine] = useState<SupplierLineItem | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  // Documents already uploaded, keyed by line item id.
  const docsByLine = useMemo(() => {
    const map = new Map<string, OrderDocument[]>();
    for (const doc of documents) {
      if (!doc.order_line_item_id) continue;
      const arr = map.get(doc.order_line_item_id) ?? [];
      arr.push(doc);
      map.set(doc.order_line_item_id, arr);
    }
    return map;
  }, [documents]);

  // Realtime: subscribe to this order's line items so status changes appear live.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`supplier-order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_line_items',
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_documents',
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', orderId, 'documents'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  const handleUpload = async (line: SupplierLineItem) => {
    if (!orderId) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: DOC_PICKER_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploadingFor(line.id);
    const { error: uploadError } = await uploadOrderDocument({
      orderId,
      lineItemId: line.id,
      fileUri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? 'application/pdf',
      documentType: 'delivery_note',
    });
    setUploadingFor(null);

    if (uploadError) {
      setSnack(uploadError.message);
      return;
    }
    await refetchDocs();
    setSnack('Document uploaded.');
  };

  const handleOpenDoc = async (doc: OrderDocument) => {
    if (!doc.file_url) return;
    const { url, error: urlError } = await getSignedUrl(doc.file_url);
    if (urlError || !url) {
      setSnack(urlError?.message ?? 'Could not open document.');
      return;
    }
    Linking.openURL(url).catch(() => setSnack('Could not open document.'));
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load this order.</Text>
        </View>
      </View>
    );
  }

  if (myLines.length === 0 || !orderContext) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.stateBox}>
          <Ionicons name="lock-closed-outline" size={28} color={palette.hullGray} />
          <Text style={styles.stateText}>You have no assigned lines on this order.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Order context */}
        <View style={styles.headerBlock}>
          {orderContext.order_number ? (
            <Text style={styles.orderNumber}>{orderContext.order_number}</Text>
          ) : null}
          <Text style={styles.vessel}>{orderContext.vessel_name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={palette.hullGray} />
            <Text style={styles.metaText}>{orderContext.port?.name ?? 'Port'}</Text>
            {orderContext.eta ? (
              <>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={palette.hullGray}
                  style={styles.metaIconGap}
                />
                <Text style={styles.metaText}>
                  ETA {dayjs(orderContext.eta).format('MMM D, HH:mm')}
                </Text>
              </>
            ) : null}
          </View>
          {orderContext.etd ? (
            <View style={styles.metaRow}>
              <Ionicons name="exit-outline" size={14} color={palette.hullGray} />
              <Text style={styles.metaText}>
                ETD {dayjs(orderContext.etd).format('MMM D, HH:mm')}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Your Assignment{myLines.length > 1 ? 's' : ''}</Text>

        {myLines.map((li) => {
          const lineDocs = docsByLine.get(li.id) ?? [];
          const hasDoc = lineDocs.length > 0;
          const nextActions = SUPPLIER_NEXT_ACTIONS[li.line_status as LineStatus] ?? [];
          return (
            <View key={li.id} style={styles.lineCard}>
              <View style={styles.lineHead}>
                <View style={styles.itemIcon}>
                  <Ionicons
                    name={
                      (li.service_categories?.icon_name ?? 'cube') as keyof typeof Ionicons.glyphMap
                    }
                    size={22}
                    color={palette.steelBlue}
                  />
                </View>
                <View style={styles.lineHeadBody}>
                  <Text style={styles.service}>{li.service_categories?.name ?? 'Service'}</Text>
                  {li.quantity != null ? (
                    <Text style={styles.qty}>
                      {li.quantity} {li.unit ?? ''}
                    </Text>
                  ) : null}
                </View>
                <OrderStatusBadge status={li.line_status} kind="line" />
              </View>

              {li.specifications ? (
                <DetailLine
                  icon="document-text-outline"
                  label="Specs"
                  value={li.specifications}
                />
              ) : null}
              {li.special_instructions ? (
                <DetailLine
                  icon="information-circle-outline"
                  label="Instructions"
                  value={li.special_instructions}
                />
              ) : null}
              {li.requested_datetime ? (
                <DetailLine
                  icon="calendar-outline"
                  label="Requested"
                  value={dayjs(li.requested_datetime).format('MMM D, YYYY · HH:mm')}
                />
              ) : null}
              {li.total_price != null ? (
                <DetailLine
                  icon="cash-outline"
                  label="Line Total"
                  value={`$${li.total_price.toFixed(2)}`}
                />
              ) : null}
              {li.supplier_decline_reason ? (
                <DetailLine
                  icon="alert-circle-outline"
                  label="Decline Reason"
                  value={li.supplier_decline_reason}
                />
              ) : null}

              {/* Delivery documents for this line */}
              <View style={styles.docsHeader}>
                <Text style={styles.docsTitle}>Delivery Docs</Text>
                <Button
                  mode="outlined"
                  compact
                  loading={uploadingFor === li.id}
                  disabled={uploadingFor === li.id}
                  style={styles.uploadBtn}
                  textColor={palette.steelBlue}
                  icon={() => (
                    <Ionicons name="cloud-upload-outline" size={16} color={palette.steelBlue} />
                  )}
                  onPress={() => handleUpload(li)}
                >
                  Upload
                </Button>
              </View>
              {lineDocs.length === 0 ? (
                <Text style={styles.emptyText}>No documents uploaded.</Text>
              ) : (
                lineDocs.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onOpen={handleOpenDoc} />
                ))
              )}

              {/* Actions */}
              <View style={styles.lineActions}>
                {nextActions.length > 0 ? (
                  <Button
                    mode="contained"
                    buttonColor={palette.steelBlue}
                    textColor={palette.fogWhite}
                    style={styles.primaryBtn}
                    icon={() => (
                      <Ionicons name="swap-vertical-outline" size={18} color={palette.fogWhite} />
                    )}
                    onPress={() => setSheetLine(li)}
                  >
                    Update Status
                  </Button>
                ) : (
                  <Text style={styles.terminalText}>No further action required.</Text>
                )}
                <Button
                  mode="outlined"
                  textColor={palette.steelBlue}
                  style={styles.chatBtn}
                  icon={() => (
                    <Ionicons name="chatbubbles-outline" size={18} color={palette.steelBlue} />
                  )}
                  onPress={() => setChatLine(li)}
                >
                  Chat
                </Button>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Status update bottom sheet */}
      <StatusUpdateSheet
        visible={sheetLine !== null}
        onDismiss={() => setSheetLine(null)}
        lineItem={sheetLine}
        hasDocument={sheetLine ? (docsByLine.get(sheetLine.id)?.length ?? 0) > 0 : false}
        onConfirm={() => {
          setSnack('Status updated.');
          refetch();
        }}
      />

      {/* Chat modal scoped to the line item */}
      <Portal>
        <Modal
          visible={chatLine !== null}
          onDismiss={() => setChatLine(null)}
          contentContainerStyle={styles.chatModal}
        >
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>
              {chatLine?.service_categories?.name ?? 'Chat'}
            </Text>
            <Button mode="text" textColor={palette.hullGray} onPress={() => setChatLine(null)}>
              Close
            </Button>
          </View>
          <Divider style={styles.divider} />
          {orderId && chatLine && userId ? (
            <MessageThread orderId={orderId} lineItemId={chatLine.id} currentUserId={userId} />
          ) : null}
        </Modal>
      </Portal>

      <Snackbar
        visible={snack !== null}
        onDismiss={() => setSnack(null)}
        duration={4000}
        style={styles.snackbar}
      >
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <Appbar.Header style={styles.appbar}>
      <Appbar.BackAction color={palette.fogWhite} onPress={onBack} />
      <Appbar.Content title="Order Detail" titleStyle={styles.appbarTitle} />
    </Appbar.Header>
  );
}

function DetailLine({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={15} color={palette.hullGray} />
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  headerBlock: { marginBottom: spacing.md },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  vessel: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 24, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  metaIconGap: { marginLeft: spacing.sm },
  metaText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  lineCard: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineHeadBody: { flex: 1 },
  service: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16 },
  qty: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  detailLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 13 },
  detailValue: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 13, flexShrink: 1 },
  docsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  docsTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 14 },
  uploadBtn: { borderColor: palette.steelBlue, borderRadius: radius.sm },
  emptyText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginBottom: spacing.xs },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  primaryBtn: { borderRadius: radius.sm, flexGrow: 1 },
  chatBtn: { borderColor: palette.steelBlue, borderRadius: radius.sm },
  terminalText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, flex: 1 },
  chatModal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    height: '80%',
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  chatTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16 },
  divider: { backgroundColor: palette.oceanMid },
  snackbar: { backgroundColor: palette.oceanMid },
});

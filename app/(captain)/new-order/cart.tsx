import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Text, Snackbar, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore, type CartItem } from '@/stores/cartStore';
import { useCreateOrder } from '@/hooks/useOrders';
import { uploadOrderDocument } from '@/lib/storage';
import ServiceCartItem from '@/components/captain/ServiceCartItem';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export default function CartReview() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalAmount = useCartStore((s) => s.totalAmount);
  const clear = useCartStore((s) => s.clear);
  const vessel = useCartStore();

  const createOrder = useCreateOrder();
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const total = useMemo(() => totalAmount(), [items, totalAmount]);

  const buildVesselInfo = () => ({
    vesselName: vessel.vesselName,
    imoNumber: vessel.imoNumber,
    portId: vessel.portId,
    portName: vessel.portName,
    eta: vessel.eta,
    etd: vessel.etd,
    charterPartyId: vessel.charterPartyId,
    charterPartyName: vessel.charterPartyName,
    shipAgentId: vessel.shipAgentId,
    shipAgentName: vessel.shipAgentName,
  });

  const handleEdit = (_item: CartItem) => {
    router.push('/(captain)/new-order/add-services');
  };

  const handleSubmit = async () => {
    if (!userId || items.length === 0 || submitting) return;
    setSubmitting(true);
    setSnack(null);
    try {
      const { orderId, lineItems } = await createOrder.mutateAsync({
        captainId: userId,
        vessel: buildVesselInfo(),
        items,
        totalAmount: total,
      });

      // Upload attached files if any
      for (const item of items) {
        if (item.fileUri && item.fileName && item.mimeType) {
          const matchedLine = lineItems.find((l) => l.service_category_id === item.serviceCategoryId);
          if (matchedLine) {
            const { error: uploadErr } = await uploadOrderDocument({
              orderId,
              lineItemId: matchedLine.id,
              fileUri: item.fileUri,
              fileName: item.fileName,
              mimeType: item.mimeType,
              documentType: 'other',
            });
            if (uploadErr) {
              console.error(`Error uploading document for ${item.serviceName}:`, uploadErr);
            }
          }
        }
      }



      // Submit for charter approval (validates & creates notification server-side).
      const submitRes = await supabase.functions.invoke('submit-for-charter-approval', {
        body: { order_id: orderId },
      });
      if (submitRes.error) {
        console.warn('submit-for-charter-approval warning:', submitRes.error);
      }

      clear();
      router.replace(`/(captain)/orders/${orderId}`);
    } catch (e) {
      console.error('Order submission error:', e);
      setSnack(e instanceof Error ? e.message : 'Failed to submit order.');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color={palette.fogWhite} onPress={() => router.back()} />
        <Appbar.Content title="Review Order" subtitle="Step 3 of 3" titleStyle={styles.appbarTitle} subtitleStyle={styles.appbarSub} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.vesselCard}>
          <Text style={styles.vesselName}>{vessel.vesselName || 'Vessel'}</Text>
          <View style={styles.vesselMetaRow}>
            <Ionicons name="location-outline" size={14} color={palette.hullGray} />
            <Text style={styles.vesselMeta}>{vessel.portName || 'Port'}</Text>
          </View>
          {vessel.charterPartyName ? (
            <View style={styles.vesselMetaRow}>
              <Ionicons name="business-outline" size={14} color={palette.hullGray} />
              <Text style={styles.vesselMeta}>{vessel.charterPartyName}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Services ({items.length})</Text>

        {items.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="cart-outline" size={32} color={palette.hullGray} />
            <Text style={styles.stateText}>Your cart is empty.</Text>
          </View>
        ) : (
          items.map((item) => (
            <ServiceCartItem
              key={item.serviceCategoryId}
              item={item}
              onEdit={handleEdit}
              onRemove={(i) => removeItem(i.serviceCategoryId)}
            />
          ))
        )}

        <Button
          mode="text"
          textColor={palette.steelBlue}
          icon={() => <Ionicons name="add" size={18} color={palette.steelBlue} />}
          onPress={() => router.push('/(captain)/new-order/add-services')}
          style={styles.addMore}
        >
          Add More Services
        </Button>


      </ScrollView>

      <View style={styles.bottomBar}>
        <Button
          mode="contained"
          disabled={items.length === 0 || submitting}
          loading={submitting}
          style={styles.submitBtn}
          contentStyle={styles.submitBtnContent}
          labelStyle={styles.submitBtnLabel}
          onPress={handleSubmit}
        >
          Submit for Charter Approval
        </Button>
      </View>

      <Snackbar
        visible={snack !== null}
        onDismiss={() => setSnack(null)}
        duration={6000}
        style={styles.snackbar}
        action={{ label: 'Dismiss', onPress: () => setSnack(null) }}
      >
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  appbarSub: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12 },
  content: { padding: spacing.md, paddingBottom: 100 },
  vesselCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  vesselName: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18, marginBottom: spacing.xs },
  vesselMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  vesselMeta: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginBottom: spacing.sm },
  stateBox: { alignItems: 'center', paddingVertical: spacing.xl },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
  addMore: { alignSelf: 'flex-start', marginTop: spacing.xs },
  divider: { backgroundColor: palette.oceanMid, marginVertical: spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 16 },
  totalValue: { fontFamily: fonts.display, color: palette.engineGreen, fontSize: 22 },
  bottomBar: { padding: spacing.md, backgroundColor: palette.navyDeep, borderTopWidth: 1, borderTopColor: palette.oceanMid },
  submitBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.md },
  submitBtnContent: { height: 50 },
  submitBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  snackbar: { backgroundColor: palette.oceanMid },
});

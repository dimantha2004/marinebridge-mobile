import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Text, RadioButton, Snackbar, ActivityIndicator, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import type { PaymentMethod } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export default function Checkout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : null;

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { order, isLoading, error } = useOrderDetail(orderId);

  const [method, setMethod] = useState<PaymentMethod>('online');
  const [processing, setProcessing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');

  useEffect(() => {
    if (order?.total_amount) {
      setCustomAmount(order.total_amount.toString());
    }
  }, [order?.total_amount]);

  const finish = () => {
    if (orderId) router.replace(`/(charter-party)/${orderId}`);
    else router.back();
  };

  const payOnline = async () => {
    if (!orderId) return;
    setProcessing(true);
    try {
      const { data, error: fnError, response: fnResponse } = await supabase.functions.invoke('create-payment-intent', {
        body: { order_id: orderId, custom_amount: customAmount || null },
      });
      if (fnError || !data?.paymentIntent) {
        let detail = 'Could not start payment. Please try again.';
        try {
          if (fnResponse) {
            const body = await fnResponse.clone().text();
            const parsed = JSON.parse(body);
            if (parsed?.error) detail = parsed.error;
          }
        } catch {}
        console.error('create-payment-intent error:', fnError, detail);
        setSnack(detail);
        setProcessing(false);
        return;
      }

      const init = await initPaymentSheet({
        merchantDisplayName: 'Marianbridge',
        paymentIntentClientSecret: data.paymentIntent,
        customerId: data.customer,
        customerEphemeralKeySecret: data.ephemeralKey,
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) {
        setSnack(init.error.message);
        setProcessing(false);
        return;
      }

      const result = await presentPaymentSheet();
      if (result.error) {
        // User cancelled or payment failed — stay on screen.
        if (result.error.code !== 'Canceled') {
          setSnack(result.error.message);
        }
        setProcessing(false);
        return;
      }

      // Success: Instead of waiting for webhook, we activate immediately.
      setSnack('Payment received. Activating your order…');
      
      await supabase
        .from('orders')
        .update({ payment_method: 'online', total_amount: customAmount ? Number(customAmount) : order?.total_amount })
        .eq('id', orderId);
      await supabase.functions.invoke('activate-order', {
        body: { order_id: orderId },
      });

      setProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      setTimeout(finish, 800);
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Payment failed.');
      setProcessing(false);
    }
  };

  const payCod = async () => {
    if (!orderId) return;
    setProcessing(true);
    try {
      const { error: updError } = await supabase
        .from('orders')
        .update({ payment_method: 'cod', total_amount: customAmount ? Number(customAmount) : order?.total_amount })
        .eq('id', orderId);
      if (updError) {
        setSnack(updError.message);
        setProcessing(false);
        return;
      }
      const { error: actError } = await supabase.functions.invoke('activate-order', {
        body: { order_id: orderId },
      });
      if (actError) {
        setSnack('Could not activate the order. Please try again.');
        setProcessing(false);
        return;
      }
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    setSnack('Order confirmed with Cash on Delivery.');
    setProcessing(false);
    setTimeout(finish, 800);
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Failed to confirm order.');
      setProcessing(false);
    }
  };

  const handlePay = () => (method === 'online' ? payOnline() : payCod());

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color={palette.fogWhite} onPress={() => router.back()} />
        <Appbar.Content title="Checkout" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error || !order ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load this order.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.summaryCard} mode="contained">
            <Card.Content>
              <Text style={styles.orderNumber}>{order.order_number ?? 'Order'}</Text>
              <Text style={styles.vessel}>{order.vessel_name}</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.amountLabel}>Amount to Pay (USD)</Text>
                <TextInput
                  mode="outlined"
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="$" />}
                  style={styles.amountInput}
                  theme={{ colors: { primary: palette.steelBlue } }}
                />
              </View>
            </Card.Content>
          </Card>

          <Text style={styles.sectionTitle}>Payment Method</Text>

          <RadioButton.Group onValueChange={(v) => setMethod(v as PaymentMethod)} value={method}>
            <MethodRow
              value="online"
              selected={method === 'online'}
              icon="card"
              title="Pay Online"
              subtitle="Secure card payment via Stripe"
            />
            <MethodRow
              value="cod"
              selected={method === 'cod'}
              icon="cash"
              title="Cash on Delivery"
              subtitle="Settle directly with suppliers on delivery"
            />
          </RadioButton.Group>
        </ScrollView>
      )}

      {order ? (
        <View style={styles.bottomBar}>
          <Button
            mode="contained"
            loading={processing}
            disabled={processing}
            style={styles.payBtn}
            contentStyle={styles.payBtnContent}
            labelStyle={styles.payBtnLabel}
            onPress={handlePay}
          >
            {method === 'online' ? 'Pay Now' : 'Confirm Order'}
          </Button>
        </View>
      ) : null}

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={5000} style={styles.snackbar}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

function MethodRow({
  value,
  selected,
  icon,
  title,
  subtitle,
}: {
  value: string;
  selected: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <Card style={[styles.methodCard, selected && styles.methodCardSelected]} mode="contained">
      <Card.Content style={styles.methodContent}>
        <Ionicons name={icon} size={24} color={selected ? palette.steelBlue : palette.hullGray} />
        <View style={styles.methodInfo}>
          <Text style={styles.methodTitle}>{title}</Text>
          <Text style={styles.methodSubtitle}>{subtitle}</Text>
        </View>
        <RadioButton value={value} color={palette.steelBlue} uncheckedColor={palette.hullGray} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  content: { padding: spacing.md, paddingBottom: 100 },
  summaryCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.lg },
  orderNumber: { fontFamily: fonts.mono, color: palette.hullGray, fontSize: 13 },
  vessel: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18, marginTop: 2 },
  amountContainer: { marginTop: spacing.md },
  amountLabel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15, marginBottom: spacing.xs },
  amountInput: { backgroundColor: palette.navyDeep, fontSize: 20, fontFamily: fonts.display },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, marginBottom: spacing.sm },
  methodCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  methodCardSelected: { borderColor: palette.steelBlue },
  methodContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  methodInfo: { flex: 1, minWidth: 0 },
  methodTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  methodSubtitle: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  bottomBar: { padding: spacing.md, backgroundColor: palette.navyDeep, borderTopWidth: 1, borderTopColor: palette.oceanMid },
  payBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.md },
  payBtnContent: { height: 50 },
  payBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm },
  snackbar: { backgroundColor: palette.oceanMid },
});

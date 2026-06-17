import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity } from 'react-native';
import {
  Appbar,
  Button,
  Text,
  TextInput,
  ActivityIndicator,
  Portal,
  Modal,
  Chip,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/cartStore';
import { SERVICE_CATEGORIES, COMMON_UNITS, serviceIconFor } from '@/constants/serviceCategories';
import type { ServiceCategory } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export default function AddServices() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const addOrUpdateItem = useCartStore((s) => s.addOrUpdateItem);
  const getItem = useCartStore((s) => s.getItem);

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // active editing modal state
  const [activeName, setActiveName] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [requestedDatetime, setRequestedDatetime] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase.from('service_categories').select('*').order('name');
      if (cancelled) return;
      if (error) setLoadError(error.message);
      else setCategories((data ?? []) as ServiceCategory[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.name, c.id);
    return map;
  }, [categories]);

  const openSheet = (name: string) => {
    const def = SERVICE_CATEGORIES.find((c) => c.name === name);
    const categoryId = categoryIdByName.get(name);
    const existing = categoryId ? getItem(categoryId) : undefined;
    setActiveName(name);
    setQuantity(existing ? String(existing.quantity) : '1');
    setUnit(existing?.unit ?? def?.defaultUnit ?? COMMON_UNITS[0]);
    setSpecifications(existing?.specifications ?? '');
    setRequestedDatetime(existing?.requestedDatetime ?? '');
    setSpecialInstructions(existing?.specialInstructions ?? '');
    setUnitPrice(existing ? String(existing.estimatedUnitPrice) : '');
  };

  const closeSheet = () => setActiveName(null);

  const saveItem = () => {
    if (!activeName) return;
    const categoryId = categoryIdByName.get(activeName);
    if (!categoryId) {
      setLoadError(`Service "${activeName}" is not configured.`);
      closeSheet();
      return;
    }
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    addOrUpdateItem({
      serviceCategoryId: categoryId,
      serviceName: activeName,
      iconName: serviceIconFor(activeName),
      quantity: qty,
      unit: unit || 'units',
      specifications: specifications.trim(),
      specialInstructions: specialInstructions.trim(),
      requestedDatetime: requestedDatetime.trim() || null,
      estimatedUnitPrice: price,
      estimatedTotalPrice: qty * price,
    });
    closeSheet();
  };

  const isAdded = (name: string) => {
    const id = categoryIdByName.get(name);
    return id ? !!getItem(id) : false;
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color={palette.fogWhite} onPress={() => router.back()} />
        <Appbar.Content title="Add Services" subtitle="Step 2 of 3" titleStyle={styles.appbarTitle} subtitleStyle={styles.appbarSub} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>Tap a service to add it to your order.</Text>
          <View style={styles.grid}>
            {SERVICE_CATEGORIES.map((cat) => {
              const added = isAdded(cat.name);
              return (
                <TouchableOpacity key={cat.name} style={styles.gridItem} onPress={() => openSheet(cat.name)} activeOpacity={0.8}>
                  <View style={[styles.gridCard, added && styles.gridCardAdded]}>
                    {added ? (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark-circle" size={20} color={palette.engineGreen} />
                      </View>
                    ) : null}
                    <Ionicons name={serviceIconFor(cat.name) as keyof typeof Ionicons.glyphMap} size={30} color={palette.steelBlue} />
                    <Text style={styles.gridLabel} numberOfLines={2}>{cat.name}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <Button
          mode="contained"
          disabled={items.length === 0}
          style={styles.reviewBtn}
          contentStyle={styles.reviewBtnContent}
          labelStyle={styles.reviewBtnLabel}
          icon={() => <Ionicons name="cart" size={20} color={palette.fogWhite} />}
          onPress={() => router.push('/(captain)/new-order/cart')}
        >
          {`Cart (${items.length}) — Review`}
        </Button>
      </View>

      <Portal>
        <Modal visible={activeName !== null} onDismiss={closeSheet} contentContainerStyle={styles.sheet}>
          <ScrollView>
            <View style={styles.sheetHeader}>
              <Ionicons name={(activeName ? serviceIconFor(activeName) : 'cube') as keyof typeof Ionicons.glyphMap} size={24} color={palette.steelBlue} />
              <Text style={styles.sheetTitle}>{activeName}</Text>
            </View>

            <View style={styles.qtyRow}>
              <TextInput
                mode="outlined"
                label="Quantity"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                style={styles.qtyInput}
                outlineColor={palette.hullGray}
                activeOutlineColor={palette.steelBlue}
              />
            </View>

            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.unitWrap}>
              {COMMON_UNITS.map((u) => (
                <Chip
                  key={u}
                  selected={unit === u}
                  onPress={() => setUnit(u)}
                  style={[styles.unitChip, unit === u && styles.unitChipSelected]}
                  textStyle={styles.unitChipText}
                >
                  {u}
                </Chip>
              ))}
            </View>

            <TextInput
              mode="outlined"
              label="Specifications"
              value={specifications}
              onChangeText={setSpecifications}
              multiline
              style={styles.input}
              outlineColor={palette.hullGray}
              activeOutlineColor={palette.steelBlue}
            />
            <TextInput
              mode="outlined"
              label="Requested Date/Time (ISO)"
              placeholder="YYYY-MM-DDTHH:mm"
              value={requestedDatetime}
              onChangeText={setRequestedDatetime}
              autoCapitalize="none"
              style={styles.input}
              outlineColor={palette.hullGray}
              activeOutlineColor={palette.steelBlue}
            />
            <TextInput
              mode="outlined"
              label="Special Instructions"
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              multiline
              style={styles.input}
              outlineColor={palette.hullGray}
              activeOutlineColor={palette.steelBlue}
            />
            <TextInput
              mode="outlined"
              label="Estimated Unit Price"
              value={unitPrice}
              onChangeText={setUnitPrice}
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              style={styles.input}
              outlineColor={palette.hullGray}
              activeOutlineColor={palette.steelBlue}
            />

            <View style={styles.sheetActions}>
              <Button mode="text" textColor={palette.hullGray} onPress={closeSheet}>
                Cancel
              </Button>
              <Button mode="contained" style={styles.saveBtn} labelStyle={styles.saveBtnLabel} onPress={saveItem}>
                Add to Cart
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  appbarSub: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12 },
  content: { padding: spacing.md, paddingBottom: 100 },
  hint: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '47%' },
  gridCard: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gridCardAdded: { borderColor: palette.engineGreen },
  checkBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  gridLabel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  bottomBar: { padding: spacing.md, backgroundColor: palette.navyDeep, borderTopWidth: 1, borderTopColor: palette.oceanMid },
  reviewBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.md },
  reviewBtnContent: { height: 50 },
  reviewBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  sheet: { backgroundColor: palette.navyDeep, margin: spacing.md, borderRadius: radius.lg, padding: spacing.md, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  qtyRow: { flexDirection: 'row', gap: spacing.sm },
  qtyInput: { flex: 1, backgroundColor: 'transparent', marginBottom: spacing.sm },
  fieldLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs },
  unitWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  unitChip: { backgroundColor: palette.oceanMid },
  unitChipSelected: { backgroundColor: palette.steelBlue },
  unitChipText: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 12 },
  input: { backgroundColor: 'transparent', marginBottom: spacing.sm },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  saveBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.sm },
  saveBtnLabel: { fontFamily: fonts.bodySemiBold },
});

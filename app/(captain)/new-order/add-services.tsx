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
import * as DocumentPicker from 'expo-document-picker';
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
  const [specifications, setSpecifications] = useState('');
  const [requestedDatetime, setRequestedDatetime] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

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

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setFileName(asset.name);
      setFileUri(asset.uri);
      setMimeType(asset.mimeType ?? null);
    } catch (err) {
      console.error('Error picking document:', err);
    }
  };

  const handleRemoveDocument = () => {
    setFileName(null);
    setFileUri(null);
    setMimeType(null);
  };

  const openSheet = (name: string) => {
    const categoryId = categoryIdByName.get(name);
    const existing = categoryId ? getItem(categoryId) : undefined;
    setActiveName(name);
    setSpecifications(existing?.specifications ?? '');
    setRequestedDatetime(existing?.requestedDatetime ?? '');
    setFileName(existing?.fileName ?? null);
    setFileUri(existing?.fileUri ?? null);
    setMimeType(existing?.mimeType ?? null);
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
    addOrUpdateItem({
      serviceCategoryId: categoryId,
      serviceName: activeName,
      iconName: serviceIconFor(activeName),
      quantity: 1,
      unit: 'units',
      specifications: specifications.trim(),
      specialInstructions: '',
      requestedDatetime: requestedDatetime.trim() || null,
      estimatedUnitPrice: 0,
      estimatedTotalPrice: 0,
      fileUri: fileUri ?? undefined,
      fileName: fileName ?? undefined,
      mimeType: mimeType ?? undefined,
    });
    closeSheet();
  };

  const isAdded = (name: string) => {
    const id = categoryIdByName.get(name);
    return id ? !!getItem(id) : false;
  };

  const standardCategories = useMemo(
    () => SERVICE_CATEGORIES.filter((c) => c.name !== 'Waste Disposal' && c.name !== 'Sludge Removal'),
    []
  );
  const wasteCategories = useMemo(
    () => SERVICE_CATEGORIES.filter((c) => c.name === 'Waste Disposal' || c.name === 'Sludge Removal'),
    []
  );

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
          
          <Text style={styles.sectionHeader}>General Services</Text>
          <View style={styles.grid}>
            {standardCategories.map((cat) => {
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

          <Text style={[styles.sectionHeader, { marginTop: spacing.lg }]}>Waste & Disposal Services</Text>
          <View style={styles.grid}>
            {wasteCategories.map((cat) => {
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

            <TextInput
              mode="outlined"
              label="Manual Message / Order Details"
              placeholder="Type your message, list requirements, or notes here..."
              value={specifications}
              onChangeText={setSpecifications}
              multiline
              numberOfLines={4}
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

            <View style={styles.attachmentSection}>
              <Text style={styles.attachmentLabel}>File Attachment (Excel, PDF, JPG, PNG, DOCX)</Text>
              {fileName ? (
                <View style={styles.fileRow}>
                  <Ionicons name="document-attach" size={20} color={palette.engineGreen} />
                  <Text style={styles.fileNameText} numberOfLines={1}>
                    {fileName}
                  </Text>
                  <TouchableOpacity onPress={handleRemoveDocument} style={styles.removeFileBtn}>
                    <Ionicons name="close-circle" size={20} color={palette.alertRed} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Button
                  mode="outlined"
                  onPress={handlePickDocument}
                  icon="paperclip"
                  textColor={palette.steelBlue}
                  style={styles.attachBtn}
                >
                  Choose Excel or File
                </Button>
              )}
            </View>

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
  sectionHeader: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 16, marginBottom: spacing.sm },
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
  attachmentSection: { marginTop: spacing.sm, marginBottom: spacing.md },
  attachmentLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 12, marginBottom: spacing.xs },
  fileRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.oceanMid, padding: spacing.sm, borderRadius: radius.sm, gap: spacing.sm },
  fileNameText: { flex: 1, fontFamily: fonts.body, color: palette.fogWhite, fontSize: 14 },
  removeFileBtn: { padding: spacing.xs },
  attachBtn: { borderColor: palette.steelBlue, borderRadius: radius.sm, borderStyle: 'dashed' },
});

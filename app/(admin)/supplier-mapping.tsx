import React, { useMemo, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View, FlatList } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  Menu,
  ActivityIndicator,
  Searchbar,
  Snackbar,
  Portal,
  Modal,
  TouchableRipple,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { serviceIconFor } from '@/constants/serviceCategories';
import type { Port, ServiceCategory, Profile } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

interface MappingRow {
  id: string;
  port_id: string | null;
  service_category_id: string | null;
  supplier_profile_id: string | null;
  active: boolean;
}

async function fetchPorts(): Promise<Port[]> {
  const { data, error } = await supabase
    .from('ports')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchSuppliers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'supplier')
    .eq('verified', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchMappings(portId: string): Promise<MappingRow[]> {
  const { data, error } = await supabase
    .from('supplier_service_mappings')
    .select('id, port_id, service_category_id, supplier_profile_id, active')
    .eq('port_id', portId);
  if (error) throw error;
  return data ?? [];
}

export default function SupplierMappingScreen() {
  const queryClient = useQueryClient();
  const [portMenuOpen, setPortMenuOpen] = useState(false);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [snack, setSnack] = useState<string | null>(null);

  const portsQuery = useQuery({ queryKey: ['admin', 'ports'], queryFn: fetchPorts });
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'service_categories'],
    queryFn: fetchCategories,
  });
  const suppliersQuery = useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: fetchSuppliers,
  });

  const mappingsQuery = useQuery({
    queryKey: ['admin', 'mappings', selectedPortId],
    queryFn: () => fetchMappings(selectedPortId as string),
    enabled: !!selectedPortId,
  });

  const supplierById = useMemo(() => {
    const map = new Map<string, Profile>();
    (suppliersQuery.data ?? []).forEach((s: Profile) => map.set(s.id, s));
    return map;
  }, [suppliersQuery.data]);

  const mappingByCategory = useMemo(() => {
    const map = new Map<string, MappingRow>();
    (mappingsQuery.data ?? []).forEach((m: MappingRow) => {
      if (m.service_category_id) map.set(m.service_category_id, m);
    });
    return map;
  }, [mappingsQuery.data]);

  const upsertMutation = useMutation({
    mutationFn: async ({
      categoryId,
      supplierId,
    }: {
      categoryId: string;
      supplierId: string;
    }) => {
      if (!selectedPortId) throw new Error('No port selected.');
      const { error } = await supabase.from('supplier_service_mappings').upsert(
        {
          port_id: selectedPortId,
          service_category_id: categoryId,
          supplier_profile_id: supplierId,
          active: true,
        },
        { onConflict: 'port_id,service_category_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setSnack('Supplier assigned.');
      setActiveCategory(null);
      setSupplierSearch('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'mappings', selectedPortId] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to assign supplier.');
    },
  });

  const selectedPort = useMemo(
    () => (portsQuery.data ?? []).find((p: Port) => p.id === selectedPortId) ?? null,
    [portsQuery.data, selectedPortId]
  );

  const filteredSuppliers = useMemo(() => {
    const list = suppliersQuery.data ?? [];
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s: Profile) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.company_name ?? '').toLowerCase().includes(q)
    );
  }, [suppliersQuery.data, supplierSearch]);

  const loadingTop = portsQuery.isLoading || categoriesQuery.isLoading;
  const topError = portsQuery.error || categoriesQuery.error || suppliersQuery.error;

  const renderSupplier = useCallback(
    ({ item }: { item: Profile }) => {
      const current =
        activeCategory && mappingByCategory.get(activeCategory.id)?.supplier_profile_id === item.id;
      return (
        <TouchableRipple
          onPress={() =>
            activeCategory &&
            upsertMutation.mutate({ categoryId: activeCategory.id, supplierId: item.id })
          }
          style={styles.supplierRow}
        >
          <View style={styles.supplierRowInner}>
            <View style={styles.supplierInfo}>
              <Text style={styles.supplierName} numberOfLines={1}>
                {item.full_name}
              </Text>
              {item.company_name ? (
                <Text style={styles.supplierCompany} numberOfLines={1}>
                  {item.company_name}
                </Text>
              ) : null}
            </View>
            {current ? (
              <Ionicons name="checkmark-circle" size={22} color={palette.engineGreen} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={palette.hullGray} />
            )}
          </View>
        </TouchableRipple>
      );
    },
    [activeCategory, mappingByCategory, upsertMutation]
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Supplier Mapping" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      {loadingTop ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : topError ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load mapping data.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Port</Text>
          <Menu
            visible={portMenuOpen}
            onDismiss={() => setPortMenuOpen(false)}
            contentStyle={styles.menuContent}
            anchor={
              <TouchableRipple
                onPress={() => setPortMenuOpen(true)}
                style={styles.dropdown}
                borderless
              >
                <View style={styles.dropdownInner}>
                  <Ionicons name="boat-outline" size={18} color={palette.steelBlue} />
                  <Text style={styles.dropdownText}>
                    {selectedPort
                      ? `${selectedPort.name}${selectedPort.locode ? ` (${selectedPort.locode})` : ''}`
                      : 'Select a port'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={palette.hullGray} />
                </View>
              </TouchableRipple>
            }
          >
            {(portsQuery.data ?? []).map((p: Port) => (
              <Menu.Item
                key={p.id}
                onPress={() => {
                  setSelectedPortId(p.id);
                  setPortMenuOpen(false);
                }}
                title={`${p.name}${p.locode ? ` (${p.locode})` : ''}`}
                titleStyle={styles.menuItemTitle}
              />
            ))}
          </Menu>

          {!selectedPortId ? (
            <View style={styles.hintBox}>
              <Ionicons name="git-network-outline" size={30} color={palette.hullGray} />
              <Text style={styles.stateText}>
                Select a port to view and assign suppliers per service.
              </Text>
            </View>
          ) : mappingsQuery.isLoading ? (
            <View style={styles.hintBox}>
              <ActivityIndicator color={palette.steelBlue} />
            </View>
          ) : mappingsQuery.error ? (
            <View style={styles.hintBox}>
              <Ionicons name="warning-outline" size={26} color={palette.alertRed} />
              <Text style={styles.stateText}>Couldn't load assignments.</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.label, styles.servicesLabel]}>Services</Text>
              {(categoriesQuery.data ?? []).map((cat: ServiceCategory) => {
                const mapping = mappingByCategory.get(cat.id);
                const supplier = mapping?.supplier_profile_id
                  ? supplierById.get(mapping.supplier_profile_id)
                  : null;
                return (
                  <Card key={cat.id} style={styles.serviceCard} mode="contained">
                    <TouchableRipple
                      onPress={() => {
                        setActiveCategory(cat);
                        setSupplierSearch('');
                      }}
                      borderless
                      style={styles.serviceRipple}
                    >
                      <Card.Content style={styles.serviceContent}>
                        <View style={styles.serviceIcon}>
                          <Ionicons
                            name={serviceIconFor(cat.name) as keyof typeof Ionicons.glyphMap}
                            size={20}
                            color={palette.steelBlue}
                          />
                        </View>
                        <View style={styles.serviceInfo}>
                          <Text style={styles.serviceName}>{cat.name}</Text>
                          {supplier ? (
                            <Text style={styles.assignedText} numberOfLines={1}>
                              {supplier.full_name}
                              {supplier.company_name ? ` · ${supplier.company_name}` : ''}
                            </Text>
                          ) : (
                            <Text style={styles.unassignedText}>Unassigned</Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={palette.hullGray} />
                      </Card.Content>
                    </TouchableRipple>
                  </Card>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      <Portal>
        <Modal
          visible={!!activeCategory}
          onDismiss={() => setActiveCategory(null)}
          contentContainerStyle={styles.modal}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {activeCategory?.name ?? ''}
            </Text>
            <TouchableRipple onPress={() => setActiveCategory(null)} borderless>
              <Ionicons name="close" size={24} color={palette.fogWhite} />
            </TouchableRipple>
          </View>
          <Text style={styles.modalSub}>Assign one verified supplier</Text>

          <Searchbar
            placeholder="Search suppliers"
            value={supplierSearch}
            onChangeText={setSupplierSearch}
            style={styles.modalSearch}
            inputStyle={styles.searchInput}
            iconColor={palette.hullGray}
            placeholderTextColor={palette.hullGray}
          />

          {suppliersQuery.isLoading ? (
            <View style={styles.modalState}>
              <ActivityIndicator color={palette.steelBlue} />
            </View>
          ) : filteredSuppliers.length === 0 ? (
            <View style={styles.modalState}>
              <Ionicons name="business-outline" size={28} color={palette.hullGray} />
              <Text style={styles.stateText}>No verified suppliers found.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredSuppliers}
              keyExtractor={(s) => s.id}
              renderItem={renderSupplier}
              style={styles.supplierList}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {upsertMutation.isPending ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={palette.steelBlue} />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          ) : null}
        </Modal>
      </Portal>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
        style={styles.snackbar}
      >
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  label: {
    fontFamily: fonts.bodySemiBold,
    color: palette.hullGray,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  servicesLabel: { marginTop: spacing.lg },
  dropdown: { backgroundColor: palette.oceanMid, borderRadius: radius.md },
  dropdownInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dropdownText: { flex: 1, fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15 },
  menuContent: { backgroundColor: palette.oceanMid },
  menuItemTitle: { fontFamily: fonts.body, color: palette.fogWhite },
  hintBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  serviceCard: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  serviceRipple: { borderRadius: radius.md },
  serviceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: { flex: 1, minWidth: 0 },
  serviceName: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  assignedText: { fontFamily: fonts.body, color: palette.engineGreen, fontSize: 13, marginTop: 2 },
  unassignedText: { fontFamily: fonts.body, color: palette.signalAmber, fontSize: 13, marginTop: 2 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: palette.oceanMid,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { flex: 1, fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  modalSub: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: spacing.xs },
  modalSearch: {
    marginTop: spacing.md,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
  },
  searchInput: { fontFamily: fonts.body, color: palette.fogWhite, minHeight: 0 },
  supplierList: { marginTop: spacing.sm },
  supplierRow: { borderRadius: radius.sm },
  supplierRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.oceanMid,
  },
  supplierInfo: { flex: 1, minWidth: 0 },
  supplierName: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15 },
  supplierCompany: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  modalState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  savingText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13 },
  snackbar: { backgroundColor: palette.oceanMid },
});

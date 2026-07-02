import React, { useState, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  TextInput,
  Switch,
  ActivityIndicator,
  Snackbar,
  Portal,
  Modal,
  TouchableRipple,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Port } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

async function fetchPorts(): Promise<Port[]> {
  const { data, error } = await supabase
    .from('ports')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default function PortsScreen() {
  const queryClient = useQueryClient();
  const [snack, setSnack] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [locode, setLocode] = useState('');
  const [active, setActive] = useState(true);

  const { data: ports, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'ports'],
    queryFn: fetchPorts,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Port name is required.');
      const { error: insErr } = await supabase.from('ports').insert({
        name: trimmed,
        country: country.trim() || null,
        locode: locode.trim() ? locode.trim().toUpperCase() : null,
        active,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          throw new Error('A port with this UN/LOCODE already exists.');
        }
        throw new Error(insErr.message);
      }
    },
    onSuccess: () => {
      setSnack('Port added.');
      setAddOpen(false);
      setName('');
      setCountry('');
      setLocode('');
      setActive(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ports'] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to add port.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error: updErr } = await supabase
        .from('ports')
        .update({ active: next })
        .eq('id', id);
      if (updErr) throw new Error(updErr.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ports'] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to update port.');
    },
  });

  const renderItem = useCallback(
    ({ item }: { item: Port }) => (
      <Card style={styles.card} mode="contained">
        <Card.Content style={styles.cardContent}>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.locode ? <Text style={styles.locode}>{item.locode}</Text> : null}
            </View>
            <Text style={styles.country}>
              {item.country ?? 'Unknown country'} ·{' '}
              <Text style={item.active ? styles.activeText : styles.inactiveText}>
                {item.active ? 'Active' : 'Inactive'}
              </Text>
            </Text>
          </View>
          <Switch
            value={item.active}
            onValueChange={(next) => toggleMutation.mutate({ id: item.id, next })}
            color={palette.engineGreen}
          />
        </Card.Content>
      </Card>
    ),
    [toggleMutation]
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Ports" titleStyle={styles.appbarTitle} />
        <Appbar.Action icon="plus" color={palette.fogWhite} onPress={() => setAddOpen(true)} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load ports.</Text>
          <Button mode="outlined" onPress={() => refetch()} style={styles.retryBtn}>
            Retry
          </Button>
        </View>
      ) : (ports ?? []).length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="boat-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>No ports yet. Add your first one.</Text>
          <Button
            mode="contained"
            onPress={() => setAddOpen(true)}
            buttonColor={palette.steelBlue}
            style={styles.retryBtn}
          >
            Add Port
          </Button>
        </View>
      ) : (
        <FlatList
          data={ports}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}

      <Portal>
        <Modal
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          contentContainerStyle={styles.modal}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Port</Text>
            <TouchableRipple onPress={() => setAddOpen(false)} borderless>
              <Ionicons name="close" size={24} color={palette.fogWhite} />
            </TouchableRipple>
          </View>

          <TextInput
            label="Name"
            value={name}
            onChangeText={setName}
            mode="outlined"
            style={styles.input}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />
          <TextInput
            label="Country"
            value={country}
            onChangeText={setCountry}
            mode="outlined"
            style={styles.input}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />
          <TextInput
            label="LOCODE (e.g. NLRTM)"
            value={locode}
            onChangeText={setLocode}
            mode="outlined"
            autoCapitalize="characters"
            style={styles.input}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Active</Text>
            <Switch value={active} onValueChange={setActive} color={palette.engineGreen} />
          </View>

          <Button
            mode="contained"
            onPress={() => addMutation.mutate()}
            loading={addMutation.isPending}
            disabled={addMutation.isPending || !name.trim()}
            buttonColor={palette.steelBlue}
            style={styles.saveBtn}
            labelStyle={styles.saveBtnLabel}
          >
            Add Port
          </Button>
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
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16, flexShrink: 1 },
  locode: { fontFamily: fonts.mono, color: palette.steelBlue, fontSize: 12 },
  country: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  activeText: { fontFamily: fonts.bodyMedium, color: palette.engineGreen },
  inactiveText: { fontFamily: fonts.bodyMedium, color: palette.hullGray },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryBtn: { marginTop: spacing.md, borderColor: palette.hullGray },
  modal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.oceanMid,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  input: { backgroundColor: palette.oceanMid, marginBottom: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  switchLabel: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15 },
  saveBtn: { borderRadius: radius.sm, marginTop: spacing.md },
  saveBtnLabel: { fontFamily: fonts.bodySemiBold },
  snackbar: { backgroundColor: palette.oceanMid },
});

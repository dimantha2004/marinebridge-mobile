import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Text,
  TextInput,
  ActivityIndicator,
  Portal,
  Modal,
  Searchbar,
  List,
  HelperText,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/cartStore';
import type { Port, Profile } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const ISO_HINT = 'YYYY-MM-DDTHH:mm';

function isValidIso(value: string): boolean {
  if (!value.trim()) return true; // optional
  return dayjs(value).isValid();
}

export default function NewOrderStep1() {
  const router = useRouter();
  const setVesselInfo = useCartStore((s) => s.setVesselInfo);
  const cart = useCartStore();

  const [vesselName, setVesselName] = useState(cart.vesselName);
  const [imoNumber, setImoNumber] = useState(cart.imoNumber);
  const [eta, setEta] = useState(cart.eta ?? '');
  const [etd, setEtd] = useState(cart.etd ?? '');

  const [portId, setPortId] = useState<string | null>(cart.portId);
  const [portName, setPortName] = useState(cart.portName);
  const [charterId, setCharterId] = useState<string | null>(cart.charterPartyId);
  const [charterName, setCharterName] = useState(cart.charterPartyName);
  const [agentId, setAgentId] = useState<string | null>(cart.shipAgentId);
  const [agentName, setAgentName] = useState(cart.shipAgentName);

  const [ports, setPorts] = useState<Port[]>([]);
  const [charters, setCharters] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [picker, setPicker] = useState<null | 'port' | 'charter' | 'agent'>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [portsRes, charterRes, agentRes] = await Promise.all([
          supabase.from('ports').select('*').eq('active', true).order('name'),
          supabase.from('profiles').select('*').eq('role', 'charter_party').order('full_name'),
          supabase.from('profiles').select('*').eq('role', 'ship_agent').order('full_name'),
        ]);
        if (cancelled) return;
        if (portsRes.error) throw portsRes.error;
        if (charterRes.error) throw charterRes.error;
        if (agentRes.error) throw agentRes.error;
        setPorts((portsRes.data ?? []) as Port[]);
        setCharters((charterRes.data ?? []) as Profile[]);
        setAgents((agentRes.data ?? []) as Profile[]);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const etaValid = isValidIso(eta);
  const etdValid = isValidIso(etd);

  const canProceed =
    vesselName.trim().length > 0 &&
    portId !== null &&
    charterId !== null &&
    etaValid &&
    etdValid;

  const handleNext = () => {
    if (!canProceed) return;
    setVesselInfo({
      vesselName: vesselName.trim(),
      imoNumber: imoNumber.trim(),
      portId,
      portName,
      eta: eta.trim() ? dayjs(eta).toISOString() : null,
      etd: etd.trim() ? dayjs(etd).toISOString() : null,
      charterPartyId: charterId,
      charterPartyName: charterName,
      shipAgentId: agentId,
      shipAgentName: agentName,
    });
    router.push('/(captain)/new-order/add-services');
  };

  const pickerData = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (picker === 'port') {
      return ports
        .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.locode ?? '').toLowerCase().includes(term))
        .map((p) => ({ id: p.id, primary: p.name, secondary: [p.country, p.locode].filter(Boolean).join(' · ') }));
    }
    if (picker === 'charter') {
      return charters
        .filter((p) => !term || p.full_name.toLowerCase().includes(term))
        .map((p) => ({ id: p.id, primary: p.full_name, secondary: p.company_name ?? '' }));
    }
    if (picker === 'agent') {
      return agents
        .filter((p) => !term || p.full_name.toLowerCase().includes(term))
        .map((p) => ({ id: p.id, primary: p.full_name, secondary: p.company_name ?? '' }));
    }
    return [];
  }, [picker, search, ports, charters, agents]);

  const handleSelect = (id: string, primary: string) => {
    if (picker === 'port') {
      setPortId(id);
      setPortName(primary);
    } else if (picker === 'charter') {
      setCharterId(id);
      setCharterName(primary);
    } else if (picker === 'agent') {
      setAgentId(id);
      setAgentName(primary);
    }
    setPicker(null);
    setSearch('');
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color={palette.fogWhite} onPress={() => router.back()} />
        <Appbar.Content title="New Order" subtitle="Step 1 of 3 · Vessel" titleStyle={styles.appbarTitle} subtitleStyle={styles.appbarSub} />
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
          <SelectField label="Port" value={portName} placeholder="Select port" icon="location" onPress={() => setPicker('port')} />

          <TextInput
            mode="outlined"
            label="Vessel Name"
            value={vesselName}
            onChangeText={setVesselName}
            style={styles.input}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />

          <TextInput
            mode="outlined"
            label="IMO Number"
            value={imoNumber}
            onChangeText={setImoNumber}
            keyboardType="number-pad"
            style={styles.input}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />

          <TextInput
            mode="outlined"
            label="ETA (ISO)"
            placeholder={ISO_HINT}
            value={eta}
            onChangeText={setEta}
            autoCapitalize="none"
            style={styles.input}
            error={!etaValid}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />
          {!etaValid ? <HelperText type="error">Use ISO format, e.g. {ISO_HINT}</HelperText> : null}

          <TextInput
            mode="outlined"
            label="ETD (ISO)"
            placeholder={ISO_HINT}
            value={etd}
            onChangeText={setEtd}
            autoCapitalize="none"
            style={styles.input}
            error={!etdValid}
            outlineColor={palette.hullGray}
            activeOutlineColor={palette.steelBlue}
          />
          {!etdValid ? <HelperText type="error">Use ISO format, e.g. {ISO_HINT}</HelperText> : null}

          <SelectField label="Charter Party" value={charterName} placeholder="Select charter party" icon="business" onPress={() => setPicker('charter')} />
          <SelectField label="Ship Agent (optional)" value={agentName} placeholder="Select ship agent" icon="person-circle" onPress={() => setPicker('agent')} />

          <Button
            mode="contained"
            disabled={!canProceed}
            style={styles.nextBtn}
            contentStyle={styles.nextBtnContent}
            labelStyle={styles.nextBtnLabel}
            onPress={handleNext}
          >
            Next
          </Button>
        </ScrollView>
      )}

      <Portal>
        <Modal visible={picker !== null} onDismiss={() => setPicker(null)} contentContainerStyle={styles.modal}>
          <Searchbar
            placeholder="Search"
            value={search}
            onChangeText={setSearch}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
            iconColor={palette.hullGray}
          />
          <ScrollView style={styles.modalList}>
            {pickerData.length === 0 ? (
              <Text style={styles.emptyText}>No matches.</Text>
            ) : (
              pickerData.map((item) => (
                <List.Item
                  key={item.id}
                  title={item.primary}
                  description={item.secondary || undefined}
                  titleStyle={styles.listTitle}
                  descriptionStyle={styles.listDesc}
                  onPress={() => handleSelect(item.id, item.primary)}
                  left={(p) => <List.Icon {...p} icon={() => <Ionicons name="chevron-forward" size={18} color={palette.steelBlue} />} />}
                />
              ))
            )}
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

function SelectField({ label, value, placeholder, icon, onPress }: { label: string; value: string; placeholder: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <View style={styles.input}>
      <Text style={styles.selectLabel}>{label}</Text>
      <Button
        mode="outlined"
        onPress={onPress}
        style={styles.selectBtn}
        contentStyle={styles.selectBtnContent}
        labelStyle={[styles.selectBtnLabel, !value && styles.selectBtnPlaceholder]}
        icon={() => <Ionicons name={icon} size={18} color={palette.steelBlue} />}
      >
        {value || placeholder}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  appbarSub: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  input: { marginBottom: spacing.md, backgroundColor: 'transparent' },
  selectLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 12, marginBottom: spacing.xs },
  selectBtn: { borderColor: palette.hullGray, borderRadius: radius.sm },
  selectBtnContent: { height: 48, justifyContent: 'flex-start' },
  selectBtnLabel: { fontFamily: fonts.body, color: palette.fogWhite, fontSize: 15 },
  selectBtnPlaceholder: { color: palette.hullGray },
  nextBtn: { backgroundColor: palette.steelBlue, borderRadius: radius.md, marginTop: spacing.md },
  nextBtnContent: { height: 50 },
  nextBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  modal: { backgroundColor: palette.navyDeep, margin: spacing.lg, borderRadius: radius.lg, padding: spacing.md, maxHeight: '75%' },
  searchbar: { backgroundColor: palette.oceanMid, marginBottom: spacing.sm },
  searchInput: { color: palette.fogWhite },
  modalList: { maxHeight: 380 },
  listTitle: { fontFamily: fonts.bodyMedium, color: palette.fogWhite },
  listDesc: { fontFamily: fonts.body, color: palette.hullGray },
  emptyText: { fontFamily: fonts.body, color: palette.hullGray, textAlign: 'center', padding: spacing.lg },
});

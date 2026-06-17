import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View, Linking } from 'react-native';
import { Appbar, Text, ActivityIndicator, Searchbar, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getSignedUrl } from '@/lib/storage';
import DocumentCard from '@/components/shared/DocumentCard';
import type { OrderDocument } from '@/types/database';
import { palette, spacing, fonts } from '@/constants/theme';

interface AggregatedDocument extends OrderDocument {
  order: {
    id: string;
    order_number: string | null;
    vessel_name: string;
  } | null;
}

/**
 * Documents across every order the agent manages. RLS already scopes
 * order_documents to accessible orders; we inner-join orders to surface vessel
 * context and group by vessel.
 */
function useAgentDocuments(userId: string | null) {
  return useQuery<AggregatedDocument[]>({
    queryKey: ['agent-documents', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_documents')
        .select(
          `*,
           order:orders!order_documents_order_id_fkey (
             id, order_number, vessel_name, ship_agent_id
           )`,
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data as unknown as (AggregatedDocument & {
        order: (AggregatedDocument['order'] & { ship_agent_id: string | null }) | null;
      })[]) ?? [];
      // Belt-and-suspenders narrowing in addition to RLS.
      return rows.filter((d) => d.order && d.order.ship_agent_id === userId);
    },
  });
}

export default function ShipAgentDocuments() {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { data, isLoading, error, refetch, isRefetching } = useAgentDocuments(userId);
  const [search, setSearch] = useState('');
  const [snack, setSnack] = useState<string | null>(null);

  const docs = data ?? [];

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? docs.filter((d: AggregatedDocument) => {
          const haystack = `${d.file_name ?? ''} ${d.order?.vessel_name ?? ''} ${d.order?.order_number ?? ''}`.toLowerCase();
          return haystack.includes(q);
        })
      : docs;

    const byVessel = new Map<string, { title: string; data: AggregatedDocument[] }>();
    for (const d of filtered) {
      const key = d.order?.id ?? 'unknown';
      const title = d.order?.vessel_name ?? 'Unknown vessel';
      if (!byVessel.has(key)) byVessel.set(key, { title, data: [] });
      byVessel.get(key)!.data.push(d);
    }
    return Array.from(byVessel.values());
  }, [docs, search]);

  const handleOpenDoc = async (doc: OrderDocument) => {
    if (!doc.file_url) return;
    const { url, error: urlError } = await getSignedUrl(doc.file_url);
    if (urlError || !url) {
      setSnack(urlError?.message ?? 'Could not open document.');
      return;
    }
    Linking.openURL(url).catch(() => setSnack('Could not open document.'));
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Documents" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Search documents or vessels"
          value={search}
          onChangeText={setSearch}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor={palette.hullGray}
          placeholderTextColor={palette.hullGray}
        />
      </View>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load documents.</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="document-text-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>
            {search.trim() ? 'No documents match your search.' : 'No documents across your vessels yet.'}
          </Text>
          <Text style={styles.hintText}>
            Open an order to upload coordination paperwork.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Ionicons name="boat-outline" size={16} color={palette.steelBlue} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <DocumentCard document={item} onOpen={handleOpenDoc} />
          )}
        />
      )}

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={4000} style={styles.snackbar}>
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  searchWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  searchbar: { backgroundColor: palette.oceanMid },
  searchInput: { color: palette.fogWhite, fontFamily: fonts.body },
  list: { padding: spacing.md, paddingTop: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' },
  hintText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: spacing.xs, textAlign: 'center', opacity: 0.8 },
  snackbar: { backgroundColor: palette.oceanMid },
});

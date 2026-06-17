import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  Chip,
  ActivityIndicator,
  List,
  Snackbar,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { serviceIconFor } from '@/constants/serviceCategories';
import { useAuthStore } from '@/stores/authStore';
import type { ServiceCategory } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

async function fetchCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default function AdminSettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const reset = useAuthStore((s) => s.reset);
  const [signingOut, setSigningOut] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const { data: categories, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'service_categories'],
    queryFn: fetchCategories,
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    const { error: soErr } = await signOut();
    if (soErr) {
      setSigningOut(false);
      setSnack(soErr.message);
      return;
    }
    reset();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Settings" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Ionicons name="shield-checkmark" size={22} color={palette.fogWhite} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.full_name ?? 'Administrator'}</Text>
                <Text style={styles.profileRole}>Admin</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Text style={styles.sectionTitle}>Service Catalog</Text>
        <Text style={styles.sectionHint}>
          Read-only. PA = requires Port Authority approval.
        </Text>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={palette.steelBlue} />
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Ionicons name="warning-outline" size={26} color={palette.alertRed} />
            <Text style={styles.stateText}>Couldn't load catalog.</Text>
            <Button mode="outlined" onPress={() => refetch()} style={styles.retryBtn}>
              Retry
            </Button>
          </View>
        ) : (categories ?? []).length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="cube-outline" size={28} color={palette.hullGray} />
            <Text style={styles.stateText}>No service categories found.</Text>
          </View>
        ) : (
          <Card style={styles.card} mode="contained">
            {(categories ?? []).map((cat: ServiceCategory, idx: number) => (
              <List.Item
                key={cat.id}
                title={cat.name}
                titleStyle={styles.listTitle}
                style={[styles.listItem, idx > 0 && styles.listDivider]}
                left={() => (
                  <View style={styles.serviceIcon}>
                    <Ionicons
                      name={
                        (cat.icon_name ?? serviceIconFor(cat.name)) as keyof typeof Ionicons.glyphMap
                      }
                      size={18}
                      color={palette.steelBlue}
                    />
                  </View>
                )}
                right={() =>
                  cat.requires_port_authority_approval ? (
                    <Chip
                      compact
                      style={styles.paChip}
                      textStyle={styles.paChipText}
                    >
                      PA
                    </Chip>
                  ) : (
                    <View style={styles.noPa}>
                      <Text style={styles.noPaText}>No approval</Text>
                    </View>
                  )
                }
              />
            ))}
          </Card>
        )}

        <Text style={styles.sectionTitle}>App Info</Text>
        <Card style={styles.card} mode="contained">
          <Card.Content style={styles.infoCard}>
            <InfoRow label="Application" value="Marianbridge" />
            <InfoRow label="Role" value="Administrator" />
            <InfoRow label="Environment" value="Expo SDK 51" />
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSignOut}
          loading={signingOut}
          disabled={signingOut}
          buttonColor={palette.alertRed}
          textColor={palette.fogWhite}
          style={styles.signOutBtn}
          labelStyle={styles.signOutLabel}
          icon="logout"
        >
          Sign Out
        </Button>
      </ScrollView>

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: palette.steelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 17 },
  profileRole: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  listItem: { paddingHorizontal: spacing.md },
  listDivider: { borderTopWidth: 1, borderTopColor: palette.navyDeep },
  listTitle: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 15 },
  serviceIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  paChip: { backgroundColor: palette.signalAmber + '33', alignSelf: 'center' },
  paChipText: { fontFamily: fonts.bodySemiBold, color: palette.signalAmber, fontSize: 11 },
  noPa: { alignSelf: 'center' },
  noPaText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 11 },
  infoCard: { gap: spacing.xs },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  infoLabel: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14 },
  infoValue: { fontFamily: fonts.bodyMedium, color: palette.fogWhite, fontSize: 14 },
  stateBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  stateText: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 14, textAlign: 'center' },
  retryBtn: { marginTop: spacing.sm, borderColor: palette.hullGray },
  signOutBtn: { borderRadius: radius.sm, marginTop: spacing.sm },
  signOutLabel: { fontFamily: fonts.bodySemiBold },
  snackbar: { backgroundColor: palette.oceanMid },
});

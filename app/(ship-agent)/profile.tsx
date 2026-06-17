import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Button, Card, Text, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const ROLE_META: Record<UserRole, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  captain: { label: 'Captain', icon: 'boat' },
  charter_party: { label: 'Charter Party', icon: 'document-text' },
  ship_agent: { label: 'Ship Agent', icon: 'navigate' },
  port_authority: { label: 'Port Authority', icon: 'shield-checkmark' },
  supplier: { label: 'Supplier', icon: 'cube' },
  admin: { label: 'Admin', icon: 'settings' },
};

export default function ProfileScreen() {
  const profile = useAuthStore((s) => s.profile);
  const reset = useAuthStore((s) => s.reset);
  const [signingOut, setSigningOut] = useState(false);

  const meta = profile?.role ? ROLE_META[profile.role] : { label: 'User', icon: 'person' as const };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    reset();
    // Root layout reacts to auth state and redirects to the sign-in flow.
    setSigningOut(false);
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Profile" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {profile?.avatar_url ? (
            <Avatar.Image size={84} source={{ uri: profile.avatar_url }} />
          ) : (
            <Avatar.Text size={84} label={initials} style={styles.avatar} labelStyle={styles.avatarLabel} />
          )}
          <Text style={styles.name}>{profile?.full_name ?? meta.label}</Text>
          <View style={styles.roleChip}>
            <Ionicons name={meta.icon} size={14} color={palette.fogWhite} />
            <Text style={styles.roleText}>{meta.label}</Text>
          </View>
        </View>

        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Field icon="business-outline" label="Company" value={profile?.company_name ?? '—'} />
            <Divider style={styles.divider} />
            <Field icon="call-outline" label="Phone" value={profile?.phone ?? '—'} />
            <Divider style={styles.divider} />
            <Field
              icon="shield-checkmark-outline"
              label="Verification"
              value={profile?.verified ? 'Verified' : 'Pending'}
              valueColor={profile?.verified ? palette.engineGreen : palette.signalAmber}
            />
          </Card.Content>
        </Card>

        <Button
          mode="outlined"
          loading={signingOut}
          disabled={signingOut}
          style={styles.signOutBtn}
          contentStyle={styles.signOutContent}
          textColor={palette.alertRed}
          icon={() => <Ionicons name="log-out-outline" size={18} color={palette.alertRed} />}
          onPress={handleSignOut}
        >
          Sign Out
        </Button>
      </ScrollView>
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={18} color={palette.hullGray} />
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { backgroundColor: palette.steelBlue },
  avatarLabel: { fontFamily: fonts.display },
  name: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 22, marginTop: spacing.md },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.steelBlue,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  roleText: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 13 },
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.lg },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  fieldLabel: { fontFamily: fonts.bodyMedium, color: palette.hullGray, fontSize: 14, flex: 1 },
  fieldValue: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 14 },
  divider: { backgroundColor: palette.navyDeep },
  signOutBtn: { borderColor: palette.alertRed, borderRadius: radius.md },
  signOutContent: { height: 48 },
});

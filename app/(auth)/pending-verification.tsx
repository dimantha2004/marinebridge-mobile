import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Snackbar,
  Text,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { fonts, palette, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { forceClearAuth, getProfile } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

/**
 * Shown to a signed-in but unverified user. Subscribes to realtime changes on
 * the user's own profiles row; when `verified` flips to true we re-fetch the
 * profile and update the store — the root auth guard then routes to the role
 * home automatically.
 */
export default function PendingVerificationScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setProfile = useAuthStore((s) => s.setProfile);
  const reset = useAuthStore((s) => s.reset);
  const userId = session?.user.id ?? null;

  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const refetch = async () => {
      const { data } = await getProfile(userId);
      if (data) setProfile(data);
    };

    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as { verified?: boolean } | null;
          if (next?.verified) {
            void refetch();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, setProfile]);

  const onSignOut = useCallback(async () => {
    setSigningOut(true);
    setError(null);
    try {
      // Force-clear everything locally and navigate unconditionally.
      await forceClearAuth();
      reset();
      router.replace('/(auth)/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign out.');
      setSigningOut(false);
    }
  }, [reset, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name="time-outline" size={40} color={palette.signalAmber} />
        </View>

        <Text style={styles.title}>Account pending admin verification</Text>
        <Text style={styles.body}>
          Your account has been created. A system administrator must verify your
          access before you can continue. You will be routed automatically as
          soon as your account is approved — no need to refresh.
        </Text>

        <View style={styles.waitingRow}>
          <ActivityIndicator size="small" color={palette.steelBlue} />
          <Text style={styles.waitingText}>Waiting for approval…</Text>
        </View>

        <Button
          mode="outlined"
          onPress={onSignOut}
          disabled={signingOut}
          style={styles.signOut}
          contentStyle={styles.signOutContent}
          textColor={palette.fogWhite}
        >
          {signingOut ? (
            <ActivityIndicator size={18} color={palette.fogWhite} />
          ) : (
            'Sign Out'
          )}
        </Button>
      </View>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={5000}
        style={styles.snackbar}
        action={{ label: 'Dismiss', onPress: () => setError(null) }}
      >
        {error}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#15304D',
  },
  iconBadge: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.signalAmber,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: palette.fogWhite,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: palette.hullGray,
    textAlign: 'center',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  waitingText: {
    fontFamily: fonts.bodyMedium,
    color: palette.steelBlue,
    fontSize: 13,
  },
  signOut: {
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    borderColor: palette.hullGray,
  },
  signOutContent: { height: 46 },
  snackbar: { backgroundColor: palette.navyDeep },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { StripeProvider } from '@stripe/stripe-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet } from 'react-native';
import {
  useFonts,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';

import { paperTheme, palette } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getProfile, ROLE_HOME } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { startHeartbeat, stopHeartbeat, removeActiveSession } from '@/lib/heartbeat';
import GlobalChatButton from '@/components/shared/GlobalChatButton';
import type { UserRole } from '@/types/database';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash may already be hidden */
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/**
 * Bootstraps the Supabase session + profile and keeps the auth store in sync.
 * Returns `true` once the initial session has resolved (regardless of outcome).
 */
function useAuthBootstrap(): boolean {
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);
  const reset = useAuthStore((s) => s.reset);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (userId: string): Promise<boolean> => {
      const { data, error } = await getProfile(userId);
      if (!mounted) return false;
      if (error || !data) {
        // Profile fetch failed — stale/expired session. Clear everything.
        reset();
        return false;
      }
      setProfile(data);
      return true;
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!mounted) return;
      if (session?.user) {
        const loaded = await loadProfile(session.user.id);
        if (loaded) {
          setSession(session);
          void startHeartbeat();
        }
        // if !loaded, reset() was already called inside loadProfile
      } else {
        setSession(null);
        setProfile(null);
      }
      if (mounted) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        void removeActiveSession();
        stopHeartbeat();
        reset();
        return;
      }

      if (!session?.user) {
        setProfile(null);
        return;
      }

      setSession(session);

      // Only refetch the profile on a genuine identity change. TOKEN_REFRESHED
      // fires frequently in the background and must NOT trigger a refetch.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void loadProfile(session.user.id).then((ok) => {
          if (ok) void startHeartbeat();
        });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}

/**
 * Drives navigation based on auth status. Runs in an effect (never during
 * render) per expo-router guidance.
 */
function useAuthGuard() {
  const status = useAuthStore((s) => s.status);
  const profile = useAuthStore((s) => s.profile);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'anon') {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    if (status === 'unverified') {
      router.replace('/(auth)/pending-verification');
      return;
    }

    if (status === 'authed' && profile) {
      const home = ROLE_HOME[profile.role as UserRole];
      if (inAuthGroup || segments[0] !== home.split('/')[1]) {
        router.replace(home as never);
      }
    }
  }, [status, profile, segments, router]);
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const sessionReady = useAuthBootstrap();
  const ready = (fontsLoaded || !!fontError) && sessionReady;

  const onLayout = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync().catch(() => {
        /* already hidden */
      });
    }
  }, [ready]);

  if (!ready) {
    // Native splash stays visible until fonts + session resolve.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <StripeProvider publishableKey={STRIPE_KEY}>
            <GuardedStack />
          </StripeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function GuardedStack() {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';
  const showChat = status === 'authed' && !inAuthGroup;

  useAuthGuard();
  return (
    <View style={styles.guardedContainer}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(captain)" />
        <Stack.Screen name="(charter-party)" />
        <Stack.Screen name="(ship-agent)" />
        <Stack.Screen name="(supplier)" />
        <Stack.Screen name="(admin)" />
      </Stack>
      {showChat && <GlobalChatButton />}
    </View>
  );
}

const styles = StyleSheet.create({
  guardedContainer: {
    flex: 1,
  },
});

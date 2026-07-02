import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { stopHeartbeat, removeActiveSession } from '@/lib/heartbeat';
import type { Profile, UserRole } from '@/types/database';

/**
 * Maps each role to the home route it should land on after sign-in.
 * Keep in sync with the CONTRACT route table.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  captain: '/(captain)/dashboard',
  charter_party: '/(charter-party)/approvals',
  ship_agent: '/(ship-agent)/hub',
  supplier: '/(supplier)/dashboard',
  admin: '/(admin)/users',
};

export interface SignUpParams {
  email: string;
  username: string;
  password: string;
  full_name: string;
  role: UserRole;
  company_name?: string | null;
  phone?: string | null;
  [key: string]: unknown;
}

/**
 * Create a new auth user. The signup metadata (full_name, role, company_name,
 * phone, username) is carried in options.data so the DB trigger can read it from
 * raw_user_meta_data and seed the profiles row.
 */
export async function signUp({
  email,
  username,
  password,
  full_name,
  role,
  company_name,
  phone,
  ...rest
}: SignUpParams): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        role,
        username,
        company_name: company_name ?? null,
        phone: phone ?? null,
        ...rest,
      },
    },
  });
  return { error };
}

/**
 * Look up the email associated with a username, then sign in with that email.
 * This preserves the Supabase auth architecture (which requires email for auth)
 * while exposing a username-based login UX.
 *
 * The profiles table stores the email (populated by the handle_new_user trigger)
 * so we can look it up client-side without needing the admin API.
 */
export async function signIn(
  username: string,
  password: string
): Promise<{ error: Error | null }> {
  // Clear any stale session before attempting a fresh login.
  await supabase.auth.signOut({ scope: 'local' });
  const keys = await AsyncStorage.getAllKeys();
  const supabaseKeys = keys.filter((k) => k.startsWith('sb-'));
  if (supabaseKeys.length > 0) {
    await AsyncStorage.multiRemove(supabaseKeys);
  }

  // Look up the email via a security-definer function (bypasses RLS since we're
  // unauthenticated after the session clear above).
  const { data: email, error: lookupError } = await supabase.rpc('get_email_by_username', {
    p_username: username,
  });

  if (lookupError) {
    return { error: new Error(`Login lookup failed: ${lookupError.message}`) };
  }
  if (!email) {
    return { error: new Error('No account found with that username.') };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

/**
 * Attempt sign-in directly with email (legacy/fallback path).
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ error: Error | null }> {
  await supabase.auth.signOut({ scope: 'local' });
  const keys = await AsyncStorage.getAllKeys();
  const supabaseKeys = keys.filter((k) => k.startsWith('sb-'));
  if (supabaseKeys.length > 0) {
    await AsyncStorage.multiRemove(supabaseKeys);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut(): Promise<{ error: Error | null }> {
  // Clean up local state before server call.
  await removeActiveSession();
  stopHeartbeat();

  const { error } = await supabase.auth.signOut({ scope: 'global' });
  // Even if the server call fails, clear local state.
  await AsyncStorage.clear();
  return { error };
}

/**
 * Force-clear all auth state locally without a server round-trip.
 * Used on the pending-verification screen when signOut fails.
 */
export async function forceClearAuth(): Promise<void> {
  stopHeartbeat();
  await removeActiveSession();
  await supabase.auth.signOut({ scope: 'local' });
  const keys = await AsyncStorage.getAllKeys();
  const sbKeys = keys.filter((k) => k.startsWith('sb-'));
  if (sbKeys.length > 0) {
    await AsyncStorage.multiRemove(sbKeys);
  }
}

/**
 * Fetch the profile row for a user id.
 */
export async function getProfile(
  userId: string
): Promise<{ data: Profile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data: data ?? null, error };
}

/**
 * Persist the Expo push token onto the user's profile.
 */
export async function updatePushToken(
  userId: string,
  token: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
  return { error };
}

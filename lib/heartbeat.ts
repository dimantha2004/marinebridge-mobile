import { supabase } from '@/lib/supabase';

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute
const STALE_AFTER_MS = 120_000; // 2 minutes (matches the DB cleanup)

/**
 * Start sending periodic heartbeats to mark this user as active.
 * Call after the user is authenticated.
 */
export async function startHeartbeat(): Promise<void> {
  stopHeartbeat();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const send = async () => {
    try {
      await supabase.from('active_sessions').upsert(
        {
          user_id: user.id,
          last_heartbeat: new Date().toISOString(),
          metadata: {},
        },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );
    } catch {
      // Silently fail; the next heartbeat will retry.
    }
  };

  // Send immediately, then every interval.
  await send();
  heartbeatInterval = setInterval(send, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop sending heartbeats (call on sign-out).
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Remove this user's active session record on sign-out.
 */
export async function removeActiveSession(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('active_sessions').delete().eq('user_id', user.id);
}

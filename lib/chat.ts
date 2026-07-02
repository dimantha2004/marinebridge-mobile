import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/database';

/**
 * Communication matrix defining which roles can message which other roles.
 * Key = sender role, Value = set of allowed receiver roles.
 *
 * Rules:
 * - Captain ↔ Charter Party, Ship Agent
 * - Supplier ↔ Charter Party, Ship Agent
 * - Admin ↔ All
 */
const CHAT_MATRIX: Record<UserRole, Set<UserRole>> = {
  captain: new Set<UserRole>(['charter_party', 'ship_agent', 'admin']),
  charter_party: new Set<UserRole>(['captain', 'ship_agent', 'supplier', 'admin']),
  ship_agent: new Set<UserRole>(['captain', 'charter_party', 'supplier', 'admin']),
  supplier: new Set<UserRole>(['ship_agent']),
  admin: new Set<UserRole>(['captain', 'charter_party', 'ship_agent', 'supplier']),
};

/**
 * Check whether a user with `senderRole` is allowed to message
 * a user with `receiverRole`.
 */
export function canChat(senderRole: UserRole, receiverRole: UserRole): boolean {
  if (senderRole === 'admin') return true;
  const allowed = CHAT_MATRIX[senderRole];
  return allowed?.has(receiverRole) ?? false;
}

/**
 * Check if a direct message between two user IDs is allowed.
 * Returns `true` if permitted, `false` if blocked (403).
 */
export async function canUsersChat(
  senderId: string,
  receiverId: string
): Promise<boolean> {
  const { data: sender } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', senderId)
    .single();
  const { data: receiver } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', receiverId)
    .single();

  if (!sender || !receiver) return false;
  return canChat(sender.role as UserRole, receiver.role as UserRole);
}

/**
 * Send a direct message between two users, enforcing the chat matrix.
 * Returns `{ error }` with a 403-like message if unauthorized.
 */
export async function sendDirectMessage(
  senderId: string,
  receiverId: string,
  content: string
): Promise<{ error: Error | null }> {
  const allowed = await canUsersChat(senderId, receiverId);
  if (!allowed) {
    return {
      error: new Error(
        'Chat not allowed: your role cannot message users of this role.'
      ),
    };
  }

  const { error } = await supabase.from('messages').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content,
    order_id: null,
    order_line_item_id: null,
  });

  return { error };
}

/**
 * Get all roles that a given role is allowed to message.
 */
export function getAllowedReceiverRoles(senderRole: UserRole): UserRole[] {
  if (senderRole === 'admin') {
    return ['captain', 'charter_party', 'ship_agent', 'supplier'];
  }
  return Array.from(CHAT_MATRIX[senderRole] ?? []);
}

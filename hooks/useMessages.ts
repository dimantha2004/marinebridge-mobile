import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getAuthState } from '@/stores/authStore';
import { canChat } from '@/lib/chat';
import type { Message, Profile } from '@/types/database';

export interface MessageWithSender extends Message {
  sender: { full_name: string; avatar_url: string | null } | null;
}

/**
 * Fetches messages for an order (optionally narrowed to a single line item),
 * ordered chronologically, with the sender profile joined.
 */
export function useMessages(
  orderId: string | null | undefined,
  lineItemId?: string | null
) {
  const query = useQuery<MessageWithSender[]>({
    queryKey: ['messages', orderId, lineItemId ?? null],
    enabled: !!orderId,
    queryFn: async () => {
      let q = supabase
        .from('messages')
        .select(
          `*, sender:profiles!messages_sender_id_fkey ( full_name, avatar_url )`
        )
        .eq('order_id', orderId as string)
        .order('created_at', { ascending: true });

      if (lineItemId) {
        q = q.eq('order_line_item_id', lineItemId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as MessageWithSender[]) ?? [];
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface SendMessagePayload {
  orderId: string;
  content: string;
  lineItemId?: string | null;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<Message, Error, SendMessagePayload>({
    mutationFn: async ({ orderId, content, lineItemId }) => {
      const state = getAuthState();
      const senderId = state.session?.user?.id ?? null;
      if (!senderId) throw new Error('Not authenticated');

      // For order-scoped messages (with a lineItemId), enforce the chat matrix
      // by checking the sender vs other participants on the order.
      if (orderId && state.profile) {
        const { data: order } = await supabase
          .from('orders')
          .select('captain_id, charter_party_id, ship_agent_id')
          .eq('id', orderId)
          .single();

        if (order) {
          // Determine the receiver role based on who the sender is NOT
          const otherPartyIds: string[] = [
            order.captain_id,
            order.charter_party_id,
            order.ship_agent_id,
          ].filter((id): id is string => id !== null && id !== undefined).filter((id) => id !== senderId);

          if (otherPartyIds.length > 0) {
            const { data: otherProfiles } = await supabase
              .from('profiles')
              .select('role')
              .in('id', otherPartyIds);

            const otherRoles = (otherProfiles ?? []).map((p) => p.role);
            const senderRole = state.profile.role;

            // If none of the other parties are chat-permitted, reject.
            const allowed = otherRoles.some((r) => canChat(senderRole, r as Profile['role']));
            if (!allowed) {
              throw new Error(
                'Chat not allowed: your role cannot message participants of this order. (403 Forbidden)'
              );
            }
          }
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          order_id: orderId,
          order_line_item_id: lineItemId ?? null,
          sender_id: senderId,
          content,
          read_by: [senderId],
        })
        .select('*')
        .single();

      if (error) {
        // Check if error is from RLS (chat permission denied)
        if (error.code === '42501' || error.message?.includes('permission denied')) {
          throw new Error(
            'Chat not allowed: your role cannot message participants of this order. (403 Forbidden)'
          );
        }
        throw error;
      }
      return data as Message;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.orderId, variables.lineItemId ?? null],
      });
    },
    onError: (_error) => {
      // Error is surfaced to the UI via the mutation's error state.
    },
  });
}

/**
 * Marks a message as read by the current user by appending their id to read_by.
 */
export async function markRead(messageId: string): Promise<void> {
  const userId = getAuthState().session?.user?.id ?? null;
  if (!userId) return;

  const { data, error } = await supabase
    .from('messages')
    .select('read_by')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;

  const current = data?.read_by ?? [];
  if (current.includes(userId)) return;

  const { error: updateError } = await supabase
    .from('messages')
    .update({ read_by: [...current, userId] })
    .eq('id', messageId);
  if (updateError) throw updateError;
}

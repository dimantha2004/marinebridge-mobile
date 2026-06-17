import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types/database';

/**
 * Lists notifications for a recipient, newest first, and derives unreadCount.
 */
export function useNotifications(userId: string | null | undefined) {
  const query = useQuery<Notification[]>({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const data = query.data ?? [];
  const unreadCount = data.reduce((n: number, notif: Notification) => (notif.read ? n : n + 1), 0);

  return {
    data,
    unreadCount,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation<Notification, Error, string>({
    mutationFn: async (notificationId) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .select('*')
        .single();
      if (error) throw error;
      return data as Notification;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['notifications', data.recipient_id],
      });
    },
  });
}

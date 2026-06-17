import React, { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { ActivityIndicator, IconButton, Text, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/database';
import {
  useMessages,
  useSendMessage,
  type MessageWithSender,
} from '@/hooks/useMessages';
import { palette, radius, spacing, fonts } from '@/constants/theme';

export type MessageThreadProps = {
  orderId: string;
  lineItemId?: string;
  currentUserId: string;
};

export default function MessageThread({ orderId, lineItemId, currentUserId }: MessageThreadProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const { data: messages, isLoading, error, refetch } = useMessages(orderId, lineItemId);
  const sendMessage = useSendMessage();

  const items = messages ?? [];

  // Mark unread messages as read on mount / when messages change.
  useEffect(() => {
    if (!items.length) return;
    const unread = items.filter(
      (m: MessageWithSender) => m.sender_id !== currentUserId && !(m.read_by ?? []).includes(currentUserId),
    );
    if (!unread.length) return;

    (async () => {
      await Promise.all(
        unread.map((m: MessageWithSender) =>
          supabase
            .from('messages')
            .update({ read_by: Array.from(new Set([...(m.read_by ?? []), currentUserId])) })
            .eq('id', m.id),
        ),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, currentUserId]);

  // Realtime subscription: live updates for this order's messages.
  useEffect(() => {
    const channel = supabase
      .channel(`messages:order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const queryKey = ['messages', orderId, lineItemId ?? null];
          const incoming = payload.new as Message | undefined;

          if (payload.eventType === 'INSERT' && incoming) {
            // Respect optional line-item scoping.
            if (lineItemId && incoming.order_line_item_id !== lineItemId) return;

            queryClient.setQueryData<Message[]>(queryKey, (prev: Message[] | undefined) => {
              const existing = prev ?? [];
              if (existing.some((m: Message) => m.id === incoming.id)) return existing;
              return [...existing, incoming];
            });
          } else {
            queryClient.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, lineItemId, queryClient]);

  const handleSend = useCallback(() => {
    const content = draft.trim();
    if (!content) return;
    sendMessage.mutate(
      { orderId, lineItemId, content },
      { onSuccess: () => refetch() },
    );
    setDraft('');
  }, [draft, sendMessage, orderId, lineItemId, currentUserId, refetch]);

  const renderItem: ListRenderItem<Message> = ({ item }) => {
    const sent = item.sender_id === currentUserId;
    return (
      <View style={[styles.bubbleRow, sent ? styles.rowSent : styles.rowReceived]}>
        <View style={[styles.bubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={styles.bubbleText}>{item.content}</Text>
          <Text style={styles.bubbleTime}>{dayjs(item.created_at).format('HH:mm')}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn’t load messages.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>No messages yet. Start the conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          mode="outlined"
          style={styles.input}
          placeholder="Type a message…"
          value={draft}
          onChangeText={setDraft}
          multiline
          dense
          outlineColor={palette.hullGray}
          activeOutlineColor={palette.steelBlue}
          onSubmitEditing={handleSend}
        />
        <IconButton
          icon={() => <Ionicons name="send" size={20} color={palette.fogWhite} />}
          mode="contained"
          containerColor={palette.steelBlue}
          disabled={!draft.trim() || sendMessage.isPending}
          onPress={handleSend}
          accessibilityLabel="Send message"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stateText: {
    color: palette.hullGray,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  rowSent: {
    justifyContent: 'flex-end',
  },
  rowReceived: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleSent: {
    backgroundColor: palette.steelBlue,
    borderBottomRightRadius: radius.sm,
  },
  bubbleReceived: {
    backgroundColor: palette.oceanMid,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: {
    color: palette.fogWhite,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  bubbleTime: {
    color: palette.fogWhite,
    opacity: 0.6,
    fontFamily: fonts.body,
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hullGray,
    backgroundColor: palette.navyDeep,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    marginRight: spacing.sm,
    backgroundColor: palette.oceanMid,
  },
});

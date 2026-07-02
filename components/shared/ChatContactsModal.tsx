import React, { useState, useMemo, useRef, useCallback } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import {
  Avatar,
  IconButton,
  Modal,
  Portal,
  Surface,
  Text,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canChat, sendDirectMessage, getAllowedReceiverRoles } from '@/lib/chat';
import type { Profile, UserRole } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

interface ChatContact {
  id: string;
  full_name: string;
  username: string | null;
  role: UserRole;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function ChatContactsModal({ visible, onDismiss }: Props) {
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const currentProfile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const chatListRef = useRef<FlatList>(null);
  const chatDraftRef = useRef('');
  const [hasDraft, setHasDraft] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const allowedRoles = useMemo(() => {
    if (!currentProfile?.role) return [];
    return getAllowedReceiverRoles(currentProfile.role as UserRole);
  }, [currentProfile?.role]);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['chat-contacts', currentUserId, allowedRoles],
    enabled: !!currentUserId && allowedRoles.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, role')
        .in('role', allowedRoles)
        .neq('id', currentUserId!)
        .eq('verified', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as ChatContact[];
    },
  });

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts ?? [];
    return (contacts ?? []).filter(
      (c: ChatContact) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.username ?? '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const { data: chatMessages, refetch: refetchChat } = useQuery({
    queryKey: ['direct-chat', currentUserId, selectedContact?.id],
    enabled: !!selectedContact && !!currentUserId,
    queryFn: async () => {
      if (!selectedContact || !currentUserId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .is('order_id', null)
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; sender_id: string; content: string; created_at: string }[];
    },
  });

  const handleSend = useCallback(async () => {
    const text = chatDraftRef.current.trim();
    if (!text || !currentUserId || !selectedContact || chatSending) return;
    setChatSending(true);
    setSendError('');
    try {
      const { error } = await sendDirectMessage(currentUserId, selectedContact.id, text);
      if (error) {
        setSendError(error.message);
        return;
      }
      chatDraftRef.current = '';
      setHasDraft(false);
      setInputKey((k) => k + 1);
      void refetchChat();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setChatSending(false);
    }
  }, [currentUserId, selectedContact, chatSending, refetchChat]);

  const handleBack = useCallback(() => {
    setSelectedContact(null);
    chatDraftRef.current = '';
    setHasDraft(false);
    setInputKey(0);
  }, []);

  const ROLE_LABEL: Record<string, string> = {
    captain: 'Captain',
    charter_party: 'Charter Party',
    ship_agent: 'Ship Agent',
    supplier: 'Supplier',
    admin: 'Admin',
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={() => { onDismiss(); handleBack(); }}
        contentContainerStyle={styles.modal}
      >
        {selectedContact ? (
          <View style={styles.chatContainer}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderLeft}>
                <IconButton icon="arrow-left" iconColor={palette.fogWhite} onPress={handleBack} />
                <View>
                  <Text style={styles.chatHeaderName}>{selectedContact.full_name}</Text>
                  <Text style={styles.chatHeaderRole}>{ROLE_LABEL[selectedContact.role]}</Text>
                </View>
              </View>
              <IconButton icon="close" iconColor={palette.fogWhite} onPress={() => { onDismiss(); handleBack(); }} />
            </View>

            <FlatList
              ref={chatListRef}
              data={chatMessages ?? []}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.chatList}
              keyboardShouldPersistTaps="always"
              onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const sent = item.sender_id === currentUserId;
                return (
                  <View style={[styles.bubbleRow, sent ? styles.rowSent : styles.rowReceived]}>
                    <Surface style={[styles.bubble, sent ? styles.bubbleSent : styles.bubbleReceived]}>
                      <Text style={styles.bubbleText}>{item.content}</Text>
                    </Surface>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={32} color={palette.hullGray} />
                  <Text style={styles.emptyText}>Start a conversation.</Text>
                </View>
              }
            />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.composer}>
                {sendError ? (
                  <Text style={styles.sendError}>{sendError}</Text>
                ) : null}
                <TextInput
                  key={`input-${selectedContact?.id}-${inputKey}`}
                  mode="outlined"
                  style={styles.input}
                  placeholder="Type a message..."
                  defaultValue=""
                  onChangeText={(t) => { chatDraftRef.current = t; setHasDraft(t.trim().length > 0); }}
                  multiline
                  dense
                  outlineColor={palette.hullGray}
                  activeOutlineColor={palette.steelBlue}
                />
                <IconButton
                  icon={() => <Ionicons name="send" size={20} color={palette.fogWhite} />}
                  mode="contained"
                  containerColor={palette.steelBlue}
                  disabled={chatSending || !hasDraft}
                  onPress={handleSend}
                />
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : (
          <View style={styles.contactsContainer}>
            <View style={styles.contactsHeader}>
              <Text style={styles.contactsTitle}>New Chat</Text>
              <IconButton icon="close" iconColor={palette.fogWhite} onPress={onDismiss} />
            </View>

            <Surface style={styles.searchbar}>
              <Ionicons name="search" size={18} color={palette.hullGray} style={styles.searchIcon} />
              <TextInput
                placeholder="Search users..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                placeholderTextColor={palette.hullGray}
                outlineStyle={{ display: 'none' }}
                dense
              />
            </Surface>

            {isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={palette.steelBlue} />
              </View>
            ) : filteredContacts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={32} color={palette.hullGray} />
                <Text style={styles.emptyText}>No contacts available.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => (
                  <Surface
                    style={styles.contactItem}
                    onTouchEnd={() => setSelectedContact(item)}
                  >
                    <Avatar.Text
                      size={40}
                      label={item.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      style={styles.avatar}
                      color={palette.fogWhite}
                    />
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.full_name}</Text>
                      <Text style={styles.contactRole}>{ROLE_LABEL[item.role]}</Text>
                    </View>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.steelBlue} />
                  </Surface>
                )}
              />
            )}
          </View>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    height: '85%',
    overflow: 'hidden',
  },
  contactsContainer: {
    flex: 1,
    backgroundColor: palette.navyDeep,
  },
  contactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.oceanMid,
  },
  contactsTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: palette.fogWhite,
  },
  searchbar: {
    margin: spacing.sm,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
  },
  searchInput: {
    fontFamily: fonts.body,
    color: palette.fogWhite,
    minHeight: 0,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: palette.oceanMid,
  },
  avatar: {
    backgroundColor: palette.steelBlue,
    marginRight: spacing.md,
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 15,
  },
  contactRole: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginTop: 1,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: palette.navyDeep,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: palette.oceanMid,
    backgroundColor: palette.navyDeep,
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chatHeaderName: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
    fontSize: 16,
  },
  chatHeaderRole: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginTop: 1,
  },
  chatList: {
    padding: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    textAlign: 'center',
  },
  sendError: {
    fontFamily: fonts.body,
    color: palette.alertRed,
    fontSize: 12,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  searchIcon: {
    marginLeft: spacing.sm,
  },
});

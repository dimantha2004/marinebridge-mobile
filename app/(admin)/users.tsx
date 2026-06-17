import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Chip,
  Button,
  ActivityIndicator,
  IconButton,
  Searchbar,
  Snackbar,
  Modal,
  Surface,
  Dialog,
  Portal,
  TextInput,
  SegmentedButtons,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { sendDirectMessage } from '@/lib/chat';
import { useAuthStore } from '@/stores/authStore';
import type { Profile, UserRole } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const ROLE_LABEL: Record<string, string> = {
  captain: 'Captain',
  charter_party: 'Charter Party',
  ship_agent: 'Ship Agent',
  port_authority: 'Port Authority',
  supplier: 'Supplier',
  admin: 'Admin',
};

const ROLE_COLOR: Record<UserRole, string> = {
  captain: palette.steelBlue,
  charter_party: palette.signalAmber,
  ship_agent: palette.engineGreen,
  port_authority: '#8B5CF6',
  supplier: '#06B6D4',
  admin: palette.alertRed,
};

async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('verified', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export default function AdminUsersScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [snack, setSnack] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'verified'>('pending');

  // Detail modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  // Password reset
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Chat
  const [chatTarget, setChatTarget] = useState<Profile | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const chatListRef = useRef<FlatList>(null);
  const { data: chatMessages, refetch: refetchChat } = useQuery({
    queryKey: ['admin', 'chat', chatTarget?.id],
    enabled: !!chatTarget,
    queryFn: async () => {
      if (!chatTarget || !currentUserId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${chatTarget.id}),and(sender_id.eq.${chatTarget.id},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; sender_id: string; content: string; created_at: string }[];
    },
  });

  const { data: profilesData, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: fetchProfiles,
  });
  const profiles = (profilesData ?? []) as Profile[];

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ verified: true })
        .eq('id', id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      setSnack('Account verified.');
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'profiles'] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to verify account.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (profile: Profile) => {
      // Delete the auth user (service role needed) - use edge function or admin API.
      // For now, delete the profile and the auth user via a soft-delete approach.
      const { error: profileErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);
      if (profileErr) throw profileErr;
    },
    onSuccess: () => {
      setSnack('Account rejected and removed.');
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'profiles'] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to reject account.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (profile: Profile) => {
      const { error: profileErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);
      if (profileErr) throw profileErr;
    },
    onSuccess: () => {
      setSnack('User deleted permanently.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'profiles'] });
    },
    onError: (e: unknown) => {
      setSnack(e instanceof Error ? e.message : 'Failed to delete user.');
    },
  });

  const handlePasswordReset = async () => {
    if (!resetTarget) return;
    setResetSubmitting(true);
    setResetResult(null);
    try {
      const { data, error: funcError } = await supabase.rpc(
        'admin_initiate_password_reset',
        { target_user_id: resetTarget.id }
      );
      if (funcError) throw funcError;
      setResetResult(`Reset token generated. Share this with the user so they can set a new password.\n\nToken: ${data}`);
    } catch (e) {
      setResetResult(e instanceof Error ? e.message : 'Failed to initiate reset.');
    }
    setResetSubmitting(false);
  };

  const verifiedList = useMemo(() => {
    return profiles.filter((p: Profile) => p.verified);
  }, [profiles]);

  const pendingList = useMemo(() => {
    return profiles.filter((p: Profile) => !p.verified && p.role !== 'admin');
  }, [profiles]);

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingList;
    return pendingList.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        ROLE_LABEL[p.role].toLowerCase().includes(q)
    );
  }, [pendingList, search]);

  const filteredVerified = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return verifiedList;
    return verifiedList.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        ROLE_LABEL[p.role].toLowerCase().includes(q)
    );
  }, [verifiedList, search]);

  const currentList = tab === 'pending' ? filteredPending : filteredVerified;

  const closeDetail = () => setSelectedUser(null);

  const renderDetailFields = (p: Profile) => {
    const fields: { label: string; value: string | null }[] = [
      { label: 'Username', value: p.username },
      { label: 'Email', value: p.email },
      { label: 'Full Name', value: p.full_name },
      { label: 'Role', value: ROLE_LABEL[p.role] },
      { label: 'Company', value: p.company_name },
      { label: 'Phone', value: p.phone },
      { label: 'Verified', value: p.verified ? 'Yes' : 'No' },
    ];

    const roleSpecific: { label: string; value: string | null }[] = [];
    switch (p.role) {
      case 'captain':
        roleSpecific.push({ label: 'Passport No', value: p.passport_no });
        roleSpecific.push({ label: 'SID No', value: p.sid_no });
        break;
      case 'charter_party':
        roleSpecific.push({ label: 'CP No', value: p.cp_no });
        roleSpecific.push({ label: 'IMO No', value: p.imo_no });
        roleSpecific.push({ label: 'Contract Date', value: p.contract_date });
        break;
      case 'ship_agent':
        roleSpecific.push({ label: 'Company Reg No', value: p.company_reg_no });
        roleSpecific.push({ label: 'IMO Agent Code', value: p.imo_agent_code });
        roleSpecific.push({ label: 'TIN No', value: p.tin_no });
        break;
      case 'port_authority':
        roleSpecific.push({ label: 'UN/LOCODE', value: p.unlocode });
        roleSpecific.push({ label: 'Port ID', value: p.port_id_text });
        roleSpecific.push({ label: 'ISPS Code', value: p.isps_code });
        break;
      case 'supplier':
        roleSpecific.push({ label: 'Business No', value: p.business_no });
        roleSpecific.push({ label: 'TIN No', value: p.tin_no });
        roleSpecific.push({ label: 'DUNS No', value: p.duns_no });
        break;
    }

    return [...fields, ...roleSpecific];
  };

  const renderItem = useCallback(
    ({ item }: { item: Profile }) => (
      <Card
        style={styles.card}
        mode="contained"
        onPress={() => setSelectedUser(item)}
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.rowTop}>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name}
              </Text>
              {item.username ? (
                <Text style={styles.username} numberOfLines={1}>
                  @{item.username}
                </Text>
              ) : null}
              {item.company_name ? (
                <Text style={styles.company} numberOfLines={1}>
                  {item.company_name}
                </Text>
              ) : null}
            </View>
            <Chip
              compact
              style={[styles.roleChip, { backgroundColor: ROLE_COLOR[item.role] + '33' }]}
              textStyle={[styles.roleChipText, { color: ROLE_COLOR[item.role] }]}
            >
              {ROLE_LABEL[item.role]}
            </Chip>
          </View>

          <View style={styles.rowBottom}>
            {item.verified ? (
              <View style={styles.verifiedTag}>
                <Ionicons name="checkmark-circle" size={16} color={palette.engineGreen} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : (
              <View style={styles.verifiedTag}>
                <Ionicons name="time-outline" size={16} color={palette.signalAmber} />
                <Text style={styles.unverifiedText}>Awaiting verification</Text>
              </View>
            )}
          </View>
        </Card.Content>
      </Card>
    ),
    []
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="User Management" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as 'pending' | 'verified')}
        buttons={[
          { value: 'pending', label: `Pending (${pendingList.length})` },
          { value: 'verified', label: `Verified (${verifiedList.length})` },
        ]}
        style={styles.segment}
        theme={{ colors: { secondaryContainer: palette.steelBlue } }}
      />

      <Searchbar
        placeholder={`Search ${tab === 'pending' ? 'pending' : 'verified'} users...`}
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
        inputStyle={styles.searchInput}
        iconColor={palette.hullGray}
        placeholderTextColor={palette.hullGray}
      />

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={28} color={palette.alertRed} />
          <Text style={styles.stateText}>Couldn't load users.</Text>
          <Button mode="outlined" onPress={() => refetch()} style={styles.retryBtn}>
            Retry
          </Button>
        </View>
      ) : currentList.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="people-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>
            {tab === 'pending' ? 'No pending users.' : 'No verified users.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}

      {/* User Detail Modal */}
      <Portal>
        <Modal
          visible={!!selectedUser}
          onDismiss={closeDetail}
          contentContainerStyle={styles.modal}
        >
          {selectedUser && (
            <ScrollView style={styles.modalScroll}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>User Details</Text>
                <Button compact onPress={closeDetail}>
                  <Ionicons name="close" size={20} color={palette.fogWhite} />
                </Button>
              </View>

              <Surface style={styles.detailSurface}>
                {renderDetailFields(selectedUser).map((f) => (
                  <View key={f.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{f.label}</Text>
                    <Text style={styles.detailValue} selectable>
                      {f.value || '-'}
                    </Text>
                  </View>
                ))}
              </Surface>

              <View style={styles.modalActions}>
                {!selectedUser.verified ? (
                  <>
                    <Button
                      mode="contained"
                      buttonColor={palette.engineGreen}
                      loading={verifyMutation.isPending}
                      disabled={verifyMutation.isPending}
                      onPress={() => verifyMutation.mutate(selectedUser.id)}
                      style={styles.actionBtn}
                      icon="check"
                    >
                      Verify
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor={palette.alertRed}
                      loading={rejectMutation.isPending}
                      disabled={rejectMutation.isPending}
                      onPress={() => rejectMutation.mutate(selectedUser)}
                      style={styles.actionBtn}
                      icon="close"
                    >
                      Reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      mode="contained"
                      buttonColor={palette.steelBlue}
                      onPress={() => {
                        setChatTarget(selectedUser);
                        closeDetail();
                      }}
                      style={styles.actionBtn}
                      icon="chat"
                    >
                      Chat
                    </Button>
                    <Button
                      mode="outlined"
                      textColor={palette.alertRed}
                      onPress={() => {
                        setDeleteTarget(selectedUser);
                        closeDetail();
                      }}
                      style={styles.actionBtn}
                      icon="delete"
                    >
                      Delete User
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => {
                        setResetTarget(selectedUser);
                        setResetResult(null);
                        closeDetail();
                      }}
                      style={styles.actionBtn}
                      icon="lock-reset"
                    >
                      Reset Password
                    </Button>
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </Modal>
      </Portal>

      {/* Chat Modal */}
      <Portal>
        <Modal
          visible={!!chatTarget}
          onDismiss={() => setChatTarget(null)}
          contentContainerStyle={styles.chatModal}
        >
          {chatTarget && (
            <View style={styles.chatContainer}>
              <View style={styles.chatHeader}>
                <View>
                  <Text style={styles.chatHeaderName}>{chatTarget.full_name}</Text>
                  <Text style={styles.chatHeaderRole}>
                    {ROLE_LABEL[chatTarget.role]} — @{chatTarget.username ?? 'no username'}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  iconColor={palette.fogWhite}
                  onPress={() => setChatTarget(null)}
                />
              </View>

              <FlatList
                ref={chatListRef}
                data={chatMessages ?? []}
                keyExtractor={(m) => m.id}
                contentContainerStyle={styles.chatList}
                onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                  const sent = item.sender_id === currentUserId;
                  return (
                    <View style={[styles.chatBubbleRow, sent ? styles.chatBubbleSent : styles.chatBubbleReceived]}>
                      <Surface style={[styles.chatBubble, sent ? styles.chatBubbleSentBg : styles.chatBubbleReceivedBg]}>
                        <Text style={styles.chatBubbleText}>{item.content}</Text>
                      </Surface>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.chatEmpty}>
                    <Ionicons name="chatbubbles-outline" size={32} color={palette.hullGray} />
                    <Text style={styles.chatEmptyText}>Start a conversation with this user.</Text>
                  </View>
                }
              />

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <View style={styles.chatComposer}>
                  <TextInput
                    mode="outlined"
                    style={styles.chatInput}
                    placeholder="Type a message..."
                    value={chatDraft}
                    onChangeText={setChatDraft}
                    multiline
                    dense
                    outlineColor={palette.hullGray}
                    activeOutlineColor={palette.steelBlue}
                    onSubmitEditing={async () => {
                      if (!chatDraft.trim() || !currentUserId || chatSending) return;
                      setChatSending(true);
                      await sendDirectMessage(currentUserId, chatTarget.id, chatDraft.trim());
                      setChatDraft('');
                      setChatSending(false);
                      void refetchChat();
                    }}
                  />
                  <IconButton
                    icon={() => <Ionicons name="send" size={20} color={palette.fogWhite} />}
                    mode="contained"
                    containerColor={palette.steelBlue}
                    disabled={!chatDraft.trim() || chatSending}
                    onPress={async () => {
                      if (!chatDraft.trim() || !currentUserId || chatSending) return;
                      setChatSending(true);
                      await sendDirectMessage(currentUserId, chatTarget.id, chatDraft.trim());
                      setChatDraft('');
                      setChatSending(false);
                      void refetchChat();
                    }}
                  />
                </View>
              </KeyboardAvoidingView>
            </View>
          )}
        </Modal>
      </Portal>

      {/* Delete Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={!!deleteTarget}
          onDismiss={() => setDeleteTarget(null)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Confirm Deletion</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Are you sure you want to permanently delete{' '}
              <Text style={styles.dialogBold}>{deleteTarget?.full_name}</Text>?
              This action cannot be undone. Their profile and all associated data
              will be removed.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              textColor={palette.alertRed}
              loading={deleteMutation.isPending}
              disabled={deleteMutation.isPending}
              onPress={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Password Reset Dialog */}
      <Portal>
        <Dialog
          visible={!!resetTarget}
          onDismiss={() => {
            setResetTarget(null);
            setResetResult(null);
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Password Reset</Dialog.Title>
          <Dialog.Content>
            {!resetResult ? (
              <>
                <Text style={styles.dialogText}>
                  Generate a password reset token for{' '}
                  <Text style={styles.dialogBold}>{resetTarget?.full_name}</Text>?
                  The user can use this token to set a new password.
                </Text>
                <Button
                  mode="contained"
                  onPress={handlePasswordReset}
                  loading={resetSubmitting}
                  disabled={resetSubmitting}
                  style={styles.resetBtn}
                >
                  Generate Reset Token
                </Button>
              </>
            ) : (
              <View>
                <Text style={styles.dialogText}>{resetResult}</Text>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setResetTarget(null);
                    setResetResult(null);
                  }}
                  style={styles.resetBtn}
                >
                  Done
                </Button>
              </View>
            )}
          </Dialog.Content>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
        style={styles.snackbar}
      >
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  segment: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchbar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
  },
  searchInput: { fontFamily: fonts.body, color: palette.fogWhite, minHeight: 0 },
  list: { padding: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  cardContent: { paddingVertical: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 16 },
  username: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 1 },
  company: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  roleChip: { borderRadius: radius.pill },
  roleChipText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  verifiedTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  verifiedText: { fontFamily: fonts.bodyMedium, color: palette.engineGreen, fontSize: 13 },
  unverifiedText: { fontFamily: fonts.bodyMedium, color: palette.signalAmber, fontSize: 13 },
  verifyBtn: { borderRadius: radius.sm },
  verifyBtnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryBtn: { marginTop: spacing.md, borderColor: palette.hullGray },
  // Modal styles
  modal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  modalScroll: {
    backgroundColor: palette.navyDeep,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: palette.fogWhite,
  },
  detailSurface: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.navyDeep,
  },
  detailLabel: {
    fontFamily: fonts.bodyMedium,
    color: palette.hullGray,
    fontSize: 13,
    flex: 1,
  },
  detailValue: {
    fontFamily: fonts.body,
    color: palette.fogWhite,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  actionBtn: { flex: 1, minWidth: 120, borderRadius: radius.sm },
  // Dialog styles
  dialog: { backgroundColor: palette.oceanMid },
  dialogTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 18 },
  dialogText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    lineHeight: 20,
  },
  dialogBold: {
    fontFamily: fonts.bodySemiBold,
    color: palette.fogWhite,
  },
  resetBtn: { marginTop: spacing.md, borderRadius: radius.sm },
  // Chat modal styles
  chatModal: {
    backgroundColor: palette.navyDeep,
    margin: spacing.md,
    borderRadius: radius.lg,
    height: '80%',
    overflow: 'hidden',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: palette.navyDeep,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.oceanMid,
    backgroundColor: palette.navyDeep,
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
    marginTop: 2,
  },
  chatList: {
    padding: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  chatEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  chatEmptyText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    textAlign: 'center',
  },
  chatBubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  chatBubbleSent: {
    justifyContent: 'flex-end',
  },
  chatBubbleReceived: {
    justifyContent: 'flex-start',
  },
  chatBubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  chatBubbleSentBg: {
    backgroundColor: palette.steelBlue,
    borderBottomRightRadius: radius.sm,
  },
  chatBubbleReceivedBg: {
    backgroundColor: palette.oceanMid,
    borderBottomLeftRadius: radius.sm,
  },
  chatBubbleText: {
    color: palette.fogWhite,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hullGray,
    backgroundColor: palette.navyDeep,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    marginRight: spacing.sm,
    backgroundColor: palette.oceanMid,
  },
  snackbar: { backgroundColor: palette.oceanMid },
});

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Chip,
  ActivityIndicator,
  Button,
  Surface,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';
import { palette, spacing, radius, fonts } from '@/constants/theme';

const ROLE_LABEL: Record<UserRole, string> = {
  captain: 'Captain',
  charter_party: 'Charter Party',
  ship_agent: 'Ship Agent',
  supplier: 'Supplier',
  admin: 'Admin',
};

const ROLE_COLOR: Record<UserRole, string> = {
  captain: palette.steelBlue,
  charter_party: palette.signalAmber,
  ship_agent: palette.engineGreen,
  supplier: '#06B6D4',
  admin: palette.alertRed,
};

const STALE_THRESHOLD_MS = 120_000; // 2 minutes

interface ActiveUser {
  user_id: string;
  last_heartbeat: string;
  metadata: Record<string, unknown> | null;
}

async function fetchActiveSessions(): Promise<ActiveUser[]> {
  const { data, error } = await supabase
    .from('active_sessions')
    .select('*')
    .gte('last_heartbeat', new Date(Date.now() - STALE_THRESHOLD_MS).toISOString());
  if (error) throw error;
  return data ?? [];
}

export default function AdminMonitoringScreen() {
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
  const [liveCount, setLiveCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: allProfiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const fetchActive = useCallback(async () => {
    try {
      const sessions = await fetchActiveSessions();
      const ids = new Set(sessions.map((s) => s.user_id));
      setActiveUserIds(ids);
    } catch {
      // Silently retry on next interval
    }
  }, []);

  useEffect(() => {
    void fetchActive();
    intervalRef.current = setInterval(fetchActive, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchActive]);

  const liveUsers = useMemo(() => {
    const list: Profile[] = allProfiles ?? [];
    const active = list.filter((p: Profile) => activeUserIds.has(p.id));
    setLiveCount(active.length);
    return active;
  }, [allProfiles, activeUserIds]);

  const renderItem = useCallback(
    ({ item }: { item: Profile }) => (
      <Card style={styles.card} mode="contained">
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <View style={styles.statusDot} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name}
              </Text>
              {item.username ? (
                <Text style={styles.username} numberOfLines={1}>
                  @{item.username}
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
        </Card.Content>
      </Card>
    ),
    []
  );

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Live Monitoring" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <Surface style={styles.liveBanner}>
        <Ionicons name="pulse" size={20} color={palette.engineGreen} />
        <Text style={styles.liveBannerText}>
          <Text style={styles.liveCount}>{liveCount}</Text> active user{liveCount !== 1 ? 's' : ''} online
        </Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
        </View>
      </Surface>

      {profilesLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.steelBlue} />
        </View>
      ) : liveUsers.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="wifi-outline" size={32} color={palette.hullGray} />
          <Text style={styles.stateText}>No active users at the moment.</Text>
          <Text style={styles.stateSubtext}>
            Active sessions appear here when users are online.
          </Text>
        </View>
      ) : (
        <FlatList
          data={liveUsers}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={fetchActive}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.navyDeep },
  appbar: { backgroundColor: palette.navyDeep },
  appbarTitle: { fontFamily: fonts.display, color: palette.fogWhite, fontSize: 20 },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.oceanMid,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  liveBannerText: {
    fontFamily: fonts.body,
    color: palette.fogWhite,
    fontSize: 14,
    flex: 1,
  },
  liveCount: {
    fontFamily: fonts.bodySemiBold,
    color: palette.engineGreen,
    fontSize: 18,
  },
  liveIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.engineGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.fogWhite,
  },
  list: { padding: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: palette.oceanMid,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  cardContent: { paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.engineGreen,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  username: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 1 },
  roleChip: { borderRadius: radius.pill },
  roleChipText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stateText: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateSubtext: {
    fontFamily: fonts.body,
    color: palette.hullGray,
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

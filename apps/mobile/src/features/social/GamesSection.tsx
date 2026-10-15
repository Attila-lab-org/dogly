/**
 * Sezione "Giochi del quartiere" nella tab Social: card del gioco con
 * anteprima classifica settimanale (prime 3 posizioni) e CTA per giocare.
 * Senza sessione la classifica resta onestamente vuota.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import { useSession } from '../auth/SessionProvider';
import { isApiConfigured } from '../auth/env';
import { isPersistedId } from '../../lib/persistedId';
import {
  GAME_LABELS,
  fetchGameLeaderboard,
  type GameId,
  type LeaderboardEntry,
} from '../games/api';
import { SquirrelArt } from '../games/squirrelArt';
import { useDogProfile } from '../core/useDogProfile';

function LeaderboardAvatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.avatar_url) {
    return (
      <Image
        source={{ uri: entry.avatar_url }}
        style={styles.avatar}
        accessibilityLabel={`Foto di ${entry.dog_name}`}
      />
    );
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <CuteIcon name="paw" size={16} color={colors.accent} secondary={colors.accent} />
    </View>
  );
}

const GAME_TABS: GameId[] = ['squirrel', 'agility', 'match'];

export function GamesSection() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const [game, setGame] = useState<GameId>('squirrel');
  const enabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);
  const leaderboard = useQuery({
    queryKey: ['games-leaderboard', game],
    queryFn: () => fetchGameLeaderboard(game),
    enabled,
    staleTime: 60_000,
  });
  const top3 = (leaderboard.data?.items ?? []).slice(0, 3);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Giochi del quartiere</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apri la classifica completa"
          onPress={() => router.push('/social/leaderboard' as never)}
          hitSlop={8}
        >
          <Text style={styles.link}>Classifica</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.tabs}>
          {GAME_TABS.map((tab) => {
            const active = game === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setGame(tab)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {GAME_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS[game]}`}
          onPress={() => router.push(`/games/${game}` as never)}
          style={({ pressed }) => [styles.gameRow, pressed && styles.pressed]}
        >
          <SquirrelArt size={64} />
          <View style={styles.gameCopy}>
            <Text style={styles.gameTitle}>{GAME_LABELS[game]}</Text>
            <Text style={styles.gameText}>
              Una partita veloce insieme a {dog.name}.
            </Text>
          </View>
          <View style={styles.playChip}>
            <CuteIcon name="play" size={14} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
            <Text style={styles.playChipText}>Gioca</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apri la classifica settimanale"
          onPress={() => router.push('/social/leaderboard' as never)}
          style={({ pressed }) => [styles.boardPreview, pressed && styles.pressed]}
        >
          {!enabled ? (
            <Text style={styles.boardEmpty}>
              Accedi per vedere la classifica del quartiere.
            </Text>
          ) : leaderboard.isLoading ? (
            <Text style={styles.boardEmpty}>Leggo la classifica…</Text>
          ) : top3.length === 0 ? (
            <Text style={styles.boardEmpty}>
              Il podio aspetta il primo campione: siate voi!
            </Text>
          ) : (
            <View style={styles.miniPodium}>
              {[top3[1], top3[0], top3[2]].filter(Boolean).map((entry) => (
                <View key={entry.dog_id} style={styles.miniPodiumItem}>
                  <Text style={styles.miniPodiumRank}>#{entry.rank}</Text>
                  <LeaderboardAvatar entry={entry} />
                  <Text
                    style={[styles.boardName, entry.is_mine && styles.boardNameMine]}
                    numberOfLines={1}
                  >
                    {entry.dog_name}
                  </Text>
                  <View style={styles.boardScore}>
                    <CuteIcon name="paw" size={12} color={colors.accent} secondary={colors.accent} />
                    <Text style={styles.boardScoreText}>{entry.score}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  tabTextActive: { color: colors.textOnPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  link: { color: colors.primary, fontWeight: typography.weight.bold },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gameCopy: { flex: 1, minWidth: 0, gap: 2 },
  gameTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  gameText: { color: colors.textSecondary, fontSize: typography.size.xs },
  playChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playChipText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  boardPreview: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  miniPodium: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  miniPodiumItem: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 90,
  },
  miniPodiumRank: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  boardRank: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    width: 26,
  },
  boardName: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  boardNameMine: { color: colors.primary, fontWeight: typography.weight.bold },
  boardScore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  boardScoreText: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  boardEmpty: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
});

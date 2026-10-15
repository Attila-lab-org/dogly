/**
 * Classifica settimanale "Giochi del quartiere" (azzera il lunedì).
 * Mio cane evidenziato; empty state onesto se nessun punteggio.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { isPersistedId } from '@/lib/persistedId';
import {
  GAME_LABELS,
  fetchGameLeaderboard,
  type GameId,
  type LeaderboardEntry,
} from '@/features/games/api';
import { SquirrelArt } from '@/features/games/squirrelArt';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View style={[styles.row, entry.is_mine && styles.rowMine]}>
      <Text style={styles.rank}>#{entry.rank}</Text>
      {entry.avatar_url ? (
        <Image
          source={{ uri: entry.avatar_url }}
          style={styles.avatar}
          accessibilityLabel={`Foto di ${entry.dog_name}`}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <CuteIcon name="paw" size={18} color={colors.accent} secondary={colors.accent} />
        </View>
      )}
      <Text
        style={[styles.name, entry.is_mine && styles.nameMine]}
        numberOfLines={1}
      >
        {entry.dog_name}
        {entry.is_mine ? ' (voi)' : ''}
      </Text>
      <View style={styles.score}>
        <CuteIcon name="paw" size={14} color={colors.accent} secondary={colors.accent} />
        <Text style={styles.scoreText}>{entry.score}</Text>
      </View>
    </View>
  );
}

const GAME_TABS: GameId[] = ['squirrel', 'agility', 'sniff'];

export default function LeaderboardScreen() {
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

  const items = leaderboard.data?.items ?? [];
  const me = leaderboard.data?.me ?? null;
  const meOutsideTop = me !== null && !items.some((entry) => entry.is_mine);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Classifica della settimana" />
      <Text style={styles.intro}>
        {`I campioni del quartiere a ${GAME_LABELS[game]}. La classifica si azzera lunedì.`}
      </Text>

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

      {!enabled ? (
        <View style={styles.emptyCard}>
          <SquirrelArt size={84} />
          <Text style={styles.emptyTitle}>Accedi per giocare la classifica</Text>
          <Text style={styles.emptyText}>
            I punteggi del quartiere si vedono solo con un account.
          </Text>
        </View>
      ) : leaderboard.isLoading ? (
        <Text style={styles.emptyText}>Leggo la classifica…</Text>
      ) : leaderboard.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void leaderboard.refetch()}
        >
          <Text style={styles.retry}>Non riesco a caricarla · Riprova</Text>
        </Pressable>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <SquirrelArt size={84} />
          <Text style={styles.emptyTitle}>Sii il primo della settimana!</Text>
          <Text style={styles.emptyText}>
            {`Nessun punteggio ancora: una partita a ${GAME_LABELS[game]} e siete in vetta.`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Gioca a ${GAME_LABELS[game]}`}
            onPress={() => router.push(`/games/${game}` as never)}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          >
            <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
            <Text style={styles.playButtonText}>Gioca ora</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((entry) => (
            <Row key={entry.dog_id} entry={entry} />
          ))}
          {meOutsideTop && me ? (
            <>
              <Text style={styles.ellipsis}>…</Text>
              <Row entry={me} />
            </>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
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
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  rowMine: { backgroundColor: colors.primarySoft },
  rank: {
    width: 34,
    color: colors.textMuted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  nameMine: { color: colors.primary, fontWeight: typography.weight.bold },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scoreText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  ellipsis: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: typography.size.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  retry: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  playButtonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.88 },
});

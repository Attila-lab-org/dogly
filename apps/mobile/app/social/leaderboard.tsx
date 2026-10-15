/**
 * Classifica settimanale "Giochi del quartiere" (azzera il lunedì).
 * Podio fisico a 3 gradini con corona e medaglie, lista dal #4, card
 * "La tua posizione" con distanza dal podio, countdown all'azzardo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { AvatarActor } from '@/features/core/AvatarActor';
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
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

const GAME_TABS: GameId[] = ['squirrel', 'agility', 'match'];

function Crown({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 28 20" style={styles.crown}>
      <Path
        d="M3 16 L1 5 L8 9 L14 2 L20 9 L27 5 L25 16 Z"
        fill="#F6C94C"
        stroke={colors.text}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={14} cy={12} r={1.8} fill={colors.text} />
    </Svg>
  );
}

function Medal({ place }: { place: 2 | 3 }) {
  const tone = place === 2 ? '#C7D2E0' : '#E8B98A';
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" style={styles.medal}>
      <Circle cx={10} cy={10} r={7.4} fill={tone} stroke={colors.text} strokeWidth={1.6} />
      <Path
        d="M10 6.4 l1.1 2.2 2.4 0.4 -1.7 1.7 0.4 2.4 -2.2 -1.1 -2.2 1.1 0.4 -2.4 -1.7 -1.7 2.4 -0.4 Z"
        fill={colors.textOnPrimary}
      />
    </Svg>
  );
}

function PodiumAvatar({ entry, size }: { entry: LeaderboardEntry; size: number }) {
  if (entry.avatar_url) {
    return (
      <Image
        source={{ uri: entry.avatar_url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityLabel={`Foto di ${entry.dog_name}`}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CuteIcon name="paw" size={size * 0.5} color={colors.accent} secondary={colors.accent} />
    </View>
  );
}

const STEP_HEIGHTS = [104, 76, 60] as const;

function Podium({ entries, reducedMotion }: { entries: LeaderboardEntry[]; reducedMotion: boolean }) {
  const ordered = [entries[1], entries[0], entries[2]].filter(Boolean);
  const places = [2, 1, 3] as const;
  return (
    <View style={styles.podium}>
      {ordered.map((entry, visualIndex) => {
        const place = places[visualIndex];
        const stepHeight = STEP_HEIGHTS[place - 1];
        return (
          <Animated.View
            key={entry.dog_id}
            entering={reducedMotion ? undefined : FadeInUp.duration(360).delay(120 + visualIndex * 140)}
            style={styles.podiumColumn}
          >
            {place === 1 ? <Crown /> : <Medal place={place as 2 | 3} />}
            <PodiumAvatar entry={entry} size={place === 1 ? 64 : 52} />
            <Text style={styles.podiumName} numberOfLines={1}>
              {entry.dog_name}
              {entry.is_mine ? ' (voi)' : ''}
            </Text>
            <View style={styles.podiumScore}>
              <CuteIcon name="paw" size={12} color={colors.accent} secondary={colors.accent} />
              <Text style={styles.podiumScoreText}>{entry.score}</Text>
            </View>
            <View
              style={[
                styles.podiumStep,
                { height: stepHeight },
                place === 1 ? styles.podiumStepFirst : null,
              ]}
            >
              <Text style={styles.podiumPlace}>{place}°</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

function BoardRow({ entry }: { entry: LeaderboardEntry }) {
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
      <Text style={[styles.name, entry.is_mine && styles.nameMine]} numberOfLines={1}>
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

/** Giorni mancanti al prossimo lunedì (azzardo classifica). */
export function daysUntilReset(now: Date = new Date()): number {
  return ((8 - now.getDay()) % 7) || 7;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const reducedMotion = useReducedMotion();
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
  const podium = items.slice(0, 3);
  const rest = items.slice(3);
  const meOutsidePodium = me !== null && !podium.some((entry) => entry.is_mine);
  const gapToPodium = useMemo(() => {
    if (!meOutsidePodium || podium.length < 3 || !me) return 0;
    return Math.max(0, podium[2].score - me.score + 1);
  }, [meOutsidePodium, podium, me]);

  const resetDays = daysUntilReset();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Classifica della settimana" />
      <View style={styles.headerRow}>
        <Text style={styles.intro}>
          {`I campioni del quartiere a ${GAME_LABELS[game]}.`}
        </Text>
        <View style={styles.resetChip}>
          <CuteIcon name="clock" size={12} color={colors.textSecondary} secondary={colors.textSecondary} />
          <Text style={styles.resetText}>
            {resetDays === 1 ? 'Si azzera domani' : `Si azzera tra ${resetDays}g`}
          </Text>
        </View>
      </View>

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
          <AvatarActor size={92} expression="happy" photoUri={dog.photoUri} dogName={dog.name} />
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
          <AvatarActor size={92} expression="happy" photoUri={dog.photoUri} dogName={dog.name} />
          <Text style={styles.emptyTitle}>Il podio aspetta il primo campione. Sarai tu?</Text>
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
        <>
          <Podium entries={podium} reducedMotion={reducedMotion} />
          {rest.length > 0 ? (
            <View style={styles.list}>
              {rest.map((entry) => (
                <BoardRow key={entry.dog_id} entry={entry} />
              ))}
            </View>
          ) : null}
          {meOutsidePodium && me ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeInUp.duration(320).delay(500)}
              style={styles.meCard}
            >
              <View style={styles.meCardMain}>
                <Text style={styles.meCardTitle}>La tua posizione</Text>
                <View style={styles.meCardScore}>
                  <CuteIcon name="paw" size={14} color={colors.accent} secondary={colors.accent} />
                  <Text style={styles.meCardScoreText}>{me.score}</Text>
                </View>
              </View>
              <Text style={styles.meCardRank}>#{me.rank}</Text>
              {gapToPodium > 0 ? (
                <Text style={styles.meCardGap}>
                  {`Ti mancano ${gapToPodium} ${gapToPodium === 1 ? 'zampina' : 'zampine'} al podio!`}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  intro: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  resetText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
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
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  podiumColumn: { alignItems: 'center', gap: 4, width: 96 },
  crown: { marginBottom: -4 },
  medal: {},
  podiumName: {
    color: colors.text,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    maxWidth: 96,
  },
  podiumScore: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  podiumScoreText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  podiumStep: {
    width: 88,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  podiumStepFirst: { backgroundColor: colors.accentSoft },
  podiumPlace: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
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
  meCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.card,
  },
  meCardMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meCardTitle: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  meCardScore: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meCardScoreText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  meCardRank: {
    color: colors.primary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
  },
  meCardGap: { color: colors.textSecondary, fontSize: typography.size.xs },
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

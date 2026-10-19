/**
 * Classifica settimanale "Giochi del quartiere" (nuovo podio il lunedì).
 * Podio fisico SOLO con partecipanti reali (mai gradini vuoti); con 0-2
 * iscritti uno stato festoso dedicato celebra chi è in testa e invita a
 * giocare/sfidare gli amici. Corona duotone vera sul vincitore.
 */
import React, { useMemo, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { ScreenContainer, SkeletonCard } from '@/components';
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
import { hapticLight } from '@/lib/haptics';

const GAME_TABS: GameId[] = ['squirrel', 'agility', 'match'];

/** Corona duotone vera: tre punte, banda teal, gemma navy. */
function Crown({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 34 28" style={styles.crown}>
      <Path
        d="M4 21 L1 7 L10 12 L17 2 L24 12 L33 7 L30 21 Z"
        fill="#F6C94C"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Rect x={4} y={21} width={26} height={4.4} rx={2.2} fill={colors.accent} stroke={colors.text} strokeWidth={1.6} />
      <Circle cx={17} cy={13} r={2.2} fill={colors.text} />
      <Circle cx={8.6} cy={10.4} r={1.4} fill={colors.textOnPrimary} opacity={0.85} />
    </Svg>
  );
}

function Medal({ place }: { place: 2 | 3 }) {
  const tone = place === 2 ? '#C7D2E0' : '#E8B98A';
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" style={styles.medal}>
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

/** Gradini SOLO per i partecipanti esistenti (mai blocchi vuoti). */
function Podium({ entries, reducedMotion }: { entries: LeaderboardEntry[]; reducedMotion: boolean }) {
  const ordered =
    entries.length === 1
      ? [entries[0]]
      : entries.length === 2
        ? [entries[1], entries[0]]
        : [entries[1], entries[0], entries[2]].filter(Boolean);
  return (
    <View style={styles.podium}>
      {ordered.map((entry) => {
        const place = entry.rank;
        const stepHeight = STEP_HEIGHTS[place - 1] ?? 60;
        return (
          <Animated.View
            key={entry.dog_id}
            entering={reducedMotion ? undefined : FadeInUp.duration(360).delay(120 + place * 120)}
            style={styles.podiumColumn}
          >
            {place === 1 ? <Crown /> : place === 2 || place === 3 ? <Medal place={place} /> : null}
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

/** Giorni mancanti al prossimo lunedì (nuovo podio). */
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

  const challengeFriends = () => {
    void Share.share({
      message: `Giochiamo a ${GAME_LABELS[game]} su Dogly: riuscite a battere ${dog.name} in classifica questa settimana?`,
    }).catch(() => {});
  };

  const resetDays = daysUntilReset();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Classifica" />

      <View style={styles.tabs}>
        {GAME_TABS.map((tab) => {
          const active = game === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                void hapticLight();
                setGame(tab);
              }}
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
          <Text style={styles.emptyTitle}>La classifica si apre con il tuo primo record</Text>
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
      ) : leaderboard.isLoading ? (
        <View style={{ gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : leaderboard.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void leaderboard.refetch()}
        >
          <Text style={styles.retry}>Non riesco a caricarla · Riprova</Text>
        </Pressable>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <AvatarActor size={92} expression="celebrate" photoUri={dog.photoUri} dogName={dog.name} />
          <Text style={styles.emptyTitle}>Il podio aspetta i campioni</Text>
          <View style={styles.emptyActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Gioca a ${GAME_LABELS[game]}`}
              onPress={() => router.push(`/games/${game}` as never)}
              style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
            >
              <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
              <Text style={styles.playButtonText}>Gioca ora</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sfida gli amici"
              onPress={challengeFriends}
              style={({ pressed }) => [styles.challengeButton, pressed && styles.pressed]}
            >
              <Text style={styles.challengeText}>Sfida gli amici</Text>
            </Pressable>
          </View>
        </View>
      ) : items.length <= 2 ? (
        <View style={styles.emptyCard}>
          <AvatarActor size={92} expression="celebrate" photoUri={dog.photoUri} dogName={dog.name} />
          <Text style={styles.emptyTitle}>
            {me ? 'Sei in testa!' : `${items[0].dog_name} è in testa!`}
          </Text>
          <Text style={styles.emptyText}>
            Il podio si completa con i campioni del quartiere.
          </Text>
          <View style={styles.miniBoard}>
            {items.map((entry) => (
              <BoardRow key={entry.dog_id} entry={entry} />
            ))}
          </View>
          <View style={styles.emptyActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Gioca a ${GAME_LABELS[game]}`}
              onPress={() => router.push(`/games/${game}` as never)}
              style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
            >
              <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
              <Text style={styles.playButtonText}>Gioca ora</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sfida gli amici"
              onPress={challengeFriends}
              style={({ pressed }) => [styles.challengeButton, pressed && styles.pressed]}
            >
              <Text style={styles.challengeText}>Sfida gli amici</Text>
            </Pressable>
          </View>
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
          <View style={styles.resetRow}>
            <View style={styles.resetChip}>
              <CuteIcon name="clock" size={12} color={colors.textSecondary} secondary={colors.textSecondary} />
              <Text style={styles.resetText}>Nuovo podio lunedì</Text>
            </View>
          </View>
        </>
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
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  podiumColumn: { alignItems: 'center', gap: 4, width: 96 },
  crown: { marginBottom: -2 },
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
  resetRow: { alignItems: 'center', marginTop: spacing.lg },
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
  emptyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  miniBoard: {
    alignSelf: 'stretch',
    gap: 2,
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
  challengeButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  challengeText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.88 },
});

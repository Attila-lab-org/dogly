/**
 * Sezione "Giochi" nella tab Social: UNA card protagonista (gioco della
 * settimana, artwork animato, record personale, mini-podio se ci sono
 * punteggi) + due card compatte per gli altri giochi. Niente tab: la
 * classifica completa si apre da "Vedi classifica".
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import { useSession } from '../auth/SessionProvider';
import { isApiConfigured } from '../auth/env';
import { isPersistedId } from '../../lib/persistedId';
import {
  GAME_LABELS,
  fetchGameLeaderboard,
  type LeaderboardEntry,
} from '../games/api';
import { loadMatchBest } from '../games/matchLogic';
import { SquirrelArt } from '../games/squirrelArt';
import { MatchPiece } from '../games/matchPieces';
import { useDogProfile } from '../core/useDogProfile';

function MiniCrown() {
  return (
    <Svg width={20} height={15} viewBox="0 0 28 20" style={styles.miniCrown}>
      <Path
        d="M3 17 L1 5 L8 9 L14 1.5 L20 9 L27 5 L25 17 Z"
        fill="#F6C94C"
        stroke={colors.text}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Rect x={3} y={17} width={22} height={2.6} rx={1.3} fill={colors.accent} />
    </Svg>
  );
}

function MiniAvatar({ entry, size }: { entry: LeaderboardEntry; size: number }) {
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

/** Tessere che fluttuano in micro-loop (pattern dell'hub giochi). */
function MatchMarkAnimated({ reducedMotion }: { reducedMotion: boolean }) {
  const float = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, float]);
  const styleA = useAnimatedStyle(() => ({
    transform: [{ translateY: -float.value * 5 }, { rotate: `${float.value * 6 - 3}deg` }],
  }));
  const styleB = useAnimatedStyle(() => ({
    transform: [{ translateY: -float.value * 3 + 2 }, { scale: 1 + float.value * 0.05 }],
  }));
  return (
    <View style={styles.markGrid}>
      <Animated.View style={styleA}><MatchPiece type={0} size={32} /></Animated.View>
      <Animated.View style={styleB}><MatchPiece type={4} size={32} /></Animated.View>
      <Animated.View style={styleB}><MatchPiece type={3} size={32} /></Animated.View>
      <Animated.View style={styleA}><MatchPiece type={1} size={32} /></Animated.View>
    </View>
  );
}

function AgilityMark() {
  return (
    <Svg width={64} height={46} viewBox="0 0 86 62">
      <Rect x={2} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={79} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={0} y={18} width={86} height={8} rx={4} fill={colors.accent} />
      <Rect x={0} y={38} width={86} height={8} rx={4} fill={colors.textOnPrimary} stroke={colors.text} strokeWidth={2} />
    </Svg>
  );
}

export function GamesSection() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const { userId, usingMockGate } = useSession();
  const enabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);
  const leaderboard = useQuery({
    queryKey: ['games-leaderboard', 'match'],
    queryFn: () => fetchGameLeaderboard('match'),
    enabled,
    staleTime: 60_000,
  });
  const [matchBest, setMatchBest] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadMatchBest(dog.id).then((value) => {
      if (alive) setMatchBest(value);
    });
    return () => {
      alive = false;
    };
  }, [dog.id]);

  const leaders = (leaderboard.data?.items ?? []).slice(0, 3);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Giochi del quartiere</Text>

      <View style={styles.heroCard}>
        <LinearGradient
          colors={['#E0F7F4', '#F0FAF6', '#FFF3D6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.weeklyChip}>
          <Text style={styles.weeklyText}>Gioco della settimana</Text>
        </View>
        <View style={styles.heroBody}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{GAME_LABELS.match}</Text>
            {matchBest !== null ? (
              <View style={styles.bestChip}>
                <CuteIcon name="paw" size={12} color={colors.accent} secondary={colors.accent} />
                <Text style={styles.bestText}>
                  {matchBest > 0 ? `Il vostro record: ${matchBest}` : 'Prima partita insieme!'}
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Gioca a ${GAME_LABELS.match}`}
              onPress={() => router.push('/games/match' as never)}
              style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
            >
              <CuteIcon name="play" size={15} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
              <Text style={styles.playText}>Gioca</Text>
            </Pressable>
          </View>
          <MatchMarkAnimated reducedMotion={reducedMotion} />
        </View>

        {enabled && leaders.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vedi la classifica completa"
            onPress={() => router.push('/social/leaderboard' as never)}
            style={({ pressed }) => [styles.miniPodium, pressed && styles.pressed]}
          >
            {leaders.map((entry, index) => (
              <View key={entry.dog_id} style={styles.miniPodiumItem}>
                {index === 0 ? <MiniCrown /> : null}
                <MiniAvatar entry={entry} size={index === 0 ? 44 : 36} />
                <Text style={styles.miniName} numberOfLines={1}>
                  {entry.dog_name}
                  {entry.is_mine ? ' (voi)' : ''}
                </Text>
              </View>
            ))}
            <Text style={styles.seeBoard}>Vedi classifica</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.otherRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS.squirrel}`}
          onPress={() => router.push('/games/squirrel' as never)}
          style={({ pressed }) => [styles.otherCard, pressed && styles.pressed]}
        >
          <SquirrelArt size={56} />
          <Text style={styles.otherTitle}>{GAME_LABELS.squirrel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS.agility}`}
          onPress={() => router.push('/games/agility' as never)}
          style={({ pressed }) => [styles.otherCard, pressed && styles.pressed]}
        >
          <AgilityMark />
          <Text style={styles.otherTitle}>{GAME_LABELS.agility}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  heroCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  weeklyChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  weeklyText: {
    color: colors.textOnPrimary,
    fontSize: 10,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  bestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  bestText: {
    color: colors.text,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  playText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 70,
    justifyContent: 'center',
    gap: 2,
  },
  miniPodium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(14, 42, 71, 0.08)',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  miniPodiumItem: { alignItems: 'center', gap: 3, maxWidth: 88 },
  miniCrown: { marginBottom: -2 },
  miniName: {
    color: colors.text,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  seeBoard: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    alignSelf: 'center',
  },
  otherRow: { flexDirection: 'row', gap: spacing.md },
  otherCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  otherTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.88 },
});

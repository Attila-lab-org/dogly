/**
 * Hub "Giochi": hero card del gioco della settimana (Bau Match, artwork
 * animato in micro-loop) con record personale, più le card compatte degli
 * altri giochi con il proprio best. Entrata scaglionata.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { PageGuide } from '@/features/guide/PageGuide';
import { SquirrelArt } from '@/features/games/squirrelArt';
import { MatchPiece } from '@/features/games/matchPieces';
import { GAME_LABELS, type GameId } from '@/features/games/api';
import { loadMatchBest } from '@/features/games/matchLogic';
import { loadSquirrelBest } from '@/features/games/squirrelLogic';
import { loadAgilityBest } from '@/features/games/agilityLogic';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

/** Tessere che fluttuano in micro-loop (reduce-motion → statiche). */
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
      <Animated.View style={styleA}>
        <MatchPiece type={0} size={34} />
      </Animated.View>
      <Animated.View style={styleB}>
        <MatchPiece type={4} size={34} />
      </Animated.View>
      <Animated.View style={styleB}>
        <MatchPiece type={3} size={34} />
      </Animated.View>
      <Animated.View style={styleA}>
        <MatchPiece type={1} size={34} />
      </Animated.View>
    </View>
  );
}

function AgilityMark() {
  return (
    <Svg width={86} height={62} viewBox="0 0 86 62">
      <Rect x={2} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={79} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={0} y={18} width={86} height={8} rx={4} fill={colors.accent} />
      <Rect x={0} y={38} width={86} height={8} rx={4} fill={colors.textOnPrimary} stroke={colors.text} strokeWidth={2} />
      <Path
        d="M30 12 C36 0 50 0 56 12"
        stroke={colors.accent}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function usePressSpring() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = () => {
    scale.value = withSpring(0.96, { damping: 12, stiffness: 260 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 9, stiffness: 220 });
  };
  return { style, onPressIn, onPressOut };
}

function BestChip({ best }: { best: number | null }) {
  if (best === null) return null;
  return (
    <View style={styles.bestChip}>
      <CuteIcon name="paw" size={12} color={colors.accent} secondary={colors.accent} />
      <Text style={styles.bestText}>
        {best > 0 ? `Record: ${best}` : 'Prima partita!'}
      </Text>
    </View>
  );
}

export default function GamesHubScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const heroPress = usePressSpring();
  const squirrelPress = usePressSpring();
  const agilityPress = usePressSpring();
  const [best, setBest] = useState<Record<'match' | 'squirrel' | 'agility', number | null>>({
    match: null,
    squirrel: null,
    agility: null,
  });

  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadMatchBest(dog.id),
      loadSquirrelBest(dog.id),
      loadAgilityBest(dog.id),
    ]).then(([match, squirrel, agility]) => {
      if (alive) setBest({ match, squirrel, agility });
    });
    return () => {
      alive = false;
    };
  }, [dog.id]);

  const enter = (delay: number) =>
    reducedMotion ? undefined : FadeInUp.duration(340).delay(delay);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Giochi" />
      <Text style={styles.intro}>
        Tre minuti di gioco insieme valgono più di un’ora di divano. Scegliete
        la vostra sfida.
      </Text>

      <Animated.View entering={enter(0)} style={heroPress.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS.match}, gioco della settimana`}
          onPress={() => router.push('/games/match' as never)}
          onPressIn={heroPress.onPressIn}
          onPressOut={heroPress.onPressOut}
          style={[styles.heroCard, styles.raised]}
        >
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
              <Text style={styles.heroText}>
                Scambia le tessere, scoppia le file, catene a moltiplicatore!
              </Text>
              <BestChip best={best.match} />
              <View style={styles.heroCta}>
                <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
                <Text style={styles.heroCtaText}>Gioca</Text>
              </View>
            </View>
            <MatchMarkAnimated reducedMotion={reducedMotion} />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View entering={enter(120)} style={squirrelPress.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS.squirrel}`}
          onPress={() => router.push('/games/squirrel' as never)}
          onPressIn={squirrelPress.onPressIn}
          onPressOut={squirrelPress.onPressOut}
          style={[styles.heroCard, styles.compactCard, styles.raised]}
        >
          <LinearGradient
            colors={['#DFF3EC', '#EAF7F1', '#FFF6E8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{GAME_LABELS.squirrel}</Text>
            <Text style={styles.heroText}>
              Gli scoiattoli sbucano dalle buche: acchiappali prima che scappino!
            </Text>
            <BestChip best={best.squirrel} />
          </View>
          <SquirrelArt size={84} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={enter(240)} style={agilityPress.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS.agility}`}
          onPress={() => router.push('/games/agility' as never)}
          onPressIn={agilityPress.onPressIn}
          onPressOut={agilityPress.onPressOut}
          style={[styles.heroCard, styles.compactCard, styles.raised]}
        >
          <LinearGradient
            colors={['#E3EFFE', '#EAF3FD', '#E0F7F4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{GAME_LABELS.agility}</Text>
            <Text style={styles.heroText}>
              Tre vite, muretti da saltare e ossicini da raccogliere al volo!
            </Text>
            <BestChip best={best.agility} />
          </View>
          <AgilityMark />
        </Pressable>
      </Animated.View>
      <PageGuide page="games" dogId={dog.id} dogName={dog.name} photoUri={dog.photoUri} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 76,
    justifyContent: 'center',
    gap: 2,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  heroCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  heroText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroCtaText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
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
  raised: { ...shadows.raised },
  pressed: { opacity: 0.9 },
});

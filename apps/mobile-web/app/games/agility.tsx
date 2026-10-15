/**
 * "Agility Oreo" — runner: il cane corre verso destra, gli ostacoli
 * arrivano da destra (muretto/birilli = salta; tunnel = NON saltare).
 * Tap (o spazio su web) = salto parabolico; collisione = fine buffa.
 * Oreo telecronista sopra il campo. Logica pura in
 * features/games/agilityLogic.ts (RNG iniettato, test dedicati).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { DogAvatar } from '@/features/core/components';
import { BuddyMascot, type BuddyExpression } from '@/features/mascot/BuddyMascot';
import {
  AGILITY_COMBO_LINE,
  AGILITY_JUMP_LINES,
  AGILITY_MAX_MS,
  AGILITY_START_LINE,
  AGILITY_TUNNEL_LINE,
  DOG_W,
  DOG_X,
  JUMP_MS,
  JUMP_HEIGHT_U,
  OBSTACLE_DIMS,
  agilityEndgameLine,
  buildAgilitySchedule,
  collides,
  isCleared,
  isCombo,
  jumpHeightAt,
  loadAgilityBest,
  obstacleX,
  pointsForClear,
  saveAgilityBest,
  type AgilityObstacle,
  type ObstacleKind,
} from '@/features/games/agilityLogic';
import { fetchGameLeaderboard, submitGameScore } from '@/features/games/api';
import { shareSquirrelResult } from '@/features/games/shareScoreCard';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { isPersistedId } from '@/lib/persistedId';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

type Phase = 'intro' | 'playing' | 'done';

const TICK_MS = 50;
const GROUND_Y = 26;
const UNIT_H = 5.2;

/** Ostacoli da agility in SVG duotone. */
function ObstacleArt({ kind }: { kind: ObstacleKind }) {
  const spec = OBSTACLE_DIMS[kind];
  const w = spec.w * 8;
  const h = spec.h * UNIT_H;
  if (kind === 'tunnel') {
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Path
          d={`M4 ${h} V${h * 0.45} C4 ${h * 0.2} ${w * 0.2} 4 ${w / 2} 4 C${w * 0.8} 4 ${w - 4} ${h * 0.2} ${w - 4} ${h * 0.45} V${h} Z`}
          fill={colors.primarySoft}
          stroke={colors.text}
          strokeWidth={3}
        />
        <Path
          d={`M${w * 0.28} ${h} V${h * 0.55} C${w * 0.28} ${h * 0.38} ${w * 0.4} ${h * 0.3} ${w / 2} ${h * 0.3} C${w * 0.6} ${h * 0.3} ${w * 0.72} ${h * 0.38} ${w * 0.72} ${h * 0.55} V${h} Z`}
          fill={colors.text}
        />
      </Svg>
    );
  }
  if (kind === 'cones') {
    const cone = (x: number) => (
      <Path
        key={x}
        d={`M${x} ${h} L${x + w * 0.14} ${h * 0.15} L${x + w * 0.28} ${h} Z`}
        fill="#F5A623"
        stroke={colors.text}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    );
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {cone(2)}
        {cone(w * 0.36)}
        {cone(w * 0.7)}
      </Svg>
    );
  }
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect x={2} y={h * 0.1} width={4} height={h} fill={colors.text} />
      <Rect x={w - 6} y={h * 0.1} width={4} height={h} fill={colors.text} />
      <Rect x={0} y={h * 0.25} width={w} height={7} rx={3} fill={colors.accent} />
      <Rect x={0} y={h * 0.55} width={w} height={7} rx={3} fill={colors.textOnPrimary} stroke={colors.text} strokeWidth={2} />
    </Svg>
  );
}

/** Il cane che corre: avatar in cerchio con bob di corsa; salta al tap. */
function RunningDog({
  photoUri,
  dogName,
  jumpY,
  crashed,
  reducedMotion,
}: {
  photoUri: string | null;
  dogName: string;
  jumpY: SharedValue<number>;
  crashed: boolean;
  reducedMotion: boolean;
}) {
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || crashed) return;
    bob.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 130, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 130, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, crashed, bob]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value - jumpY.value * UNIT_H }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.dog, style]}>
      {crashed ? (
        <BuddyMascot size={72} expression="sad" animate={false} />
      ) : photoUri ? (
        <View style={styles.dogRing}>
          <DogAvatar size={56} photoUri={photoUri} dogName={dogName} />
        </View>
      ) : (
        <BuddyMascot size={72} expression="happy" />
      )}
    </Animated.View>
  );
}

/** Buddy telecronista (stesso pattern di Scoiattolo!). */
function Commentator({
  line,
  expression,
}: {
  line: { id: number; text: string } | null;
  expression: BuddyExpression;
}) {
  return (
    <View style={styles.commentator} pointerEvents="none">
      <View style={styles.commentatorAvatar}>
        <BuddyMascot size={46} expression={expression} />
      </View>
      {line ? (
        <Animated.View
          key={line.id}
          entering={FadeIn.duration(180)}
          style={styles.commentatorBubble}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.commentatorText} numberOfLines={2}>
            {line.text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function AgilityGameScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const { userId, usingMockGate } = useSession();
  const realEnabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeObstacles, setActiveObstacles] = useState<AgilityObstacle[]>([]);
  const [crashed, setCrashed] = useState(false);
  const [commentary, setCommentary] = useState<{ id: number; text: string } | null>(null);
  const [expression, setExpression] = useState<BuddyExpression>('focused');
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);
  const [shownScore, setShownScore] = useState(0);

  const schedule = useRef<AgilityObstacle[]>([]);
  const startedAt = useRef(0);
  const jumpStart = useRef<number | null>(null);
  const clearedIds = useRef<Set<number>>(new Set());
  const streak = useRef(0);
  const commentarySeq = useRef(0);
  const commentaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldWidth = useRef(360);

  const jumpAnim = useSharedValue(0);

  useEffect(() => {
    void loadAgilityBest(dog.id).then(setBest);
  }, [dog.id]);

  const say = (text: string, next: BuddyExpression = 'focused') => {
    commentarySeq.current += 1;
    setCommentary({ id: commentarySeq.current, text });
    setExpression(next);
    if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    commentaryTimer.current = setTimeout(() => setCommentary(null), 1800);
  };

  const finish = () => {
    setPhase('done');
    setScore((finalScore) => {
      void saveAgilityBest(finalScore, dog.id).then(setBest);
      if (realEnabled) {
        setSubmitting(true);
        void (async () => {
          try {
            await submitGameScore(dog.id, finalScore, 'agility');
            const board = await fetchGameLeaderboard('agility');
            setWeekRank(board.me?.rank ?? null);
          } catch {
            setWeekRank(null);
          } finally {
            setSubmitting(false);
          }
        })();
      }
      return finalScore;
    });
  };

  const startGame = () => {
    schedule.current = buildAgilitySchedule(Math.random);
    startedAt.current = Date.now();
    jumpStart.current = null;
    clearedIds.current = new Set();
    streak.current = 0;
    jumpAnim.value = 0;
    setScore(0);
    setElapsed(0);
    setActiveObstacles([]);
    setCrashed(false);
    setWeekRank(null);
    setShareDone(false);
    setPhase('playing');
    say(AGILITY_START_LINE, 'focused');
  };

  const jump = () => {
    if (phase !== 'playing' || crashed) return;
    const now = Date.now() - startedAt.current;
    if (jumpStart.current !== null && now - jumpStart.current < JUMP_MS) return;
    jumpStart.current = now;
    if (!reducedMotion) {
      jumpAnim.value = 0;
      jumpAnim.value = withSequence(
        withTiming(JUMP_HEIGHT_U, { duration: JUMP_MS / 2, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: JUMP_MS / 2, easing: Easing.in(Easing.quad) }),
      );
    }
    say(AGILITY_JUMP_LINES[Math.floor(Math.random() * AGILITY_JUMP_LINES.length)], 'happy');
  };

  // Spazio = salto, su web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        jump();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Driver di gioco (JS thread, tick 50ms): spawn, clear, collisioni.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);
      if (now >= AGILITY_MAX_MS) {
        clearInterval(timer);
        finish();
        return;
      }
      if (!crashed) {
        const dogY = jumpHeightAt(jumpStart.current, now);
        for (const obstacle of schedule.current) {
          if (
            obstacle.spawnAtMs <= now &&
            !clearedIds.current.has(obstacle.id) &&
            collides(dogY, obstacle, now)
          ) {
            clearedIds.current.add(obstacle.id);
            setCrashed(true);
            say('Ahi! Mi siedo un attimo…', 'sad');
            clearInterval(timer);
            setTimeout(finish, 900);
            return;
          }
        }
      }
      // Clear e punteggio.
      for (const obstacle of schedule.current) {
        if (
          obstacle.spawnAtMs <= now &&
          !clearedIds.current.has(obstacle.id) &&
          isCleared(obstacle, now)
        ) {
          clearedIds.current.add(obstacle.id);
          const points = pointsForClear(streak.current);
          streak.current += 1;
          setScore((value) => value + points);
          if (isCombo(streak.current - 1)) say(AGILITY_COMBO_LINE, 'celebrate');
          else if (obstacle.kind === 'tunnel') say(AGILITY_TUNNEL_LINE, 'happy');
        }
      }
      setActiveObstacles(
        schedule.current.filter(
          (obstacle) =>
            obstacle.spawnAtMs <= now &&
            !clearedIds.current.has(obstacle.id) &&
            obstacleX(obstacle, now) > -20,
        ),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, crashed, dog.id, realEnabled]);

  // Count-up finale.
  useEffect(() => {
    if (phase !== 'done') return;
    if (reducedMotion) {
      setShownScore(score);
      return;
    }
    setShownScore(0);
    const steps = 14;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setShownScore(Math.round((score * step) / steps));
      if (step >= steps) clearInterval(timer);
    }, 45);
    return () => clearInterval(timer);
  }, [phase, score, reducedMotion]);

  const unitX = fieldWidth.current / 100;
  const remainingSeconds = Math.max(0, Math.ceil((AGILITY_MAX_MS - elapsed) / 1000));

  return (
    <ScreenContainer scroll={phase !== 'playing'}>
      <StackScreenHeader title="Agility Oreo" />

      {phase === 'intro' ? (
        <View style={styles.introWrap}>
          <View style={styles.introArtRow}>
            <ObstacleArt kind="hurdle" />
            <ObstacleArt kind="cones" />
            <ObstacleArt kind="tunnel" />
          </View>
          <Text style={styles.introTitle}>Corri e salta!</Text>
          <Text style={styles.introText}>
            Muretti e birilli si saltano con un tap.{'\n'}
            Il tunnel NO: ci passi sotto da solo.{'\n'}
            Cinque di fila e i punti raddoppiano!
          </Text>
          {best > 0 ? (
            <Text style={styles.introBest}>Il vostro record: {best} punti</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Inizia la partita"
            onPress={startGame}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <CuteIcon name="play" size={18} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
            <Text style={styles.primaryButtonText}>Inizia</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'playing' ? (
        <View style={styles.gameWrap}>
          <Commentator line={commentary} expression={expression} />
          <View style={styles.hud}>
            <View style={styles.hudScore} accessibilityLabel={`Punteggio ${score}`}>
              <CuteIcon name="paw" size={16} color={colors.accent} secondary={colors.accent} />
              <Text style={styles.hudScoreText}>{score}</Text>
            </View>
            <Text style={styles.hudTime}>{remainingSeconds}s</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salta!"
            onPress={jump}
            style={styles.field}
            onLayout={(event) => {
              fieldWidth.current = event.nativeEvent.layout.width;
            }}
          >
            <LinearGradient
              colors={['#D9ECFB', '#E7F5EE', '#DFF3EC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.groundLine} pointerEvents="none" />

            {activeObstacles.map((obstacle) => {
              const spec = OBSTACLE_DIMS[obstacle.kind];
              return (
                <View
                  key={obstacle.id}
                  pointerEvents="none"
                  style={[
                    styles.obstacle,
                    {
                      left: obstacleX(obstacle, elapsed) * unitX,
                      bottom: GROUND_Y,
                    },
                  ]}
                >
                  <ObstacleArt kind={obstacle.kind} />
                </View>
              );
            })}

            <RunningDog
              photoUri={dog.photoUri}
              dogName={dog.name}
              jumpY={jumpAnim}
              crashed={crashed}
              reducedMotion={reducedMotion}
            />
          </Pressable>
        </View>
      ) : null}

      {phase === 'done' ? (
        <View style={styles.doneWrap}>
          <Text style={styles.doneLabel}>Punteggio</Text>
          <View style={styles.doneScoreRow}>
            <CuteIcon name="paw" size={30} color={colors.accent} secondary={colors.accent} />
            <Text style={styles.doneScore} accessibilityLabel={`Punteggio finale ${score}`}>
              {shownScore}
            </Text>
          </View>
          {score >= best && score > 0 ? (
            <Text style={styles.doneBest}>Nuovo record personale!</Text>
          ) : best > 0 ? (
            <Text style={styles.doneBestPlain}>Record personale: {best}</Text>
          ) : null}
          {realEnabled ? (
            <Text style={styles.doneRank}>
              {submitting
                ? 'Salvo il punteggio in classifica…'
                : weekRank !== null
                  ? `Posizione in settimana: #${weekRank}`
                  : 'Punteggio in classifica.'}
            </Text>
          ) : (
            <Text style={styles.doneBestPlain}>
              Accedi per entrare nella classifica del quartiere.
            </Text>
          )}
          <BuddyMascot size={88} expression={score > 8 ? 'celebrate' : 'sad'} />
          <View style={styles.doneBubble}>
            <Text style={styles.doneLine}>{agilityEndgameLine(score)}</Text>
            <Text style={styles.doneLineAuthor}>— {dog.name}</Text>
          </View>
          {realEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Condividi il risultato nelle storie"
              disabled={sharing || shareDone}
              onPress={() => {
                setSharing(true);
                void shareSquirrelResult({
                  dogId: dog.id,
                  dogName: dog.name,
                  score,
                  best,
                  gameLabel: 'Agility Oreo',
                })
                  .then((ok) => setShareDone(ok))
                  .finally(() => setSharing(false));
              }}
              style={({ pressed }) => [
                styles.shareButton,
                (pressed || sharing || shareDone) && styles.pressed,
              ]}
            >
              <CuteIcon name="play" size={16} color={colors.primary} secondary={colors.primary} />
              <Text style={styles.shareButtonText}>
                {shareDone ? 'Condiviso!' : sharing ? 'Condivido…' : 'Condividi nelle storie'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rigioca"
            onPress={startGame}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <CuteIcon name="play" size={18} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
            <Text style={styles.primaryButtonText}>Rigioca</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Torna ai giochi"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Torna ai giochi</Text>
          </Pressable>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  introWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  introArtRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xl },
  introTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  introText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  introBest: { color: colors.accent, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  secondaryButton: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  secondaryButtonText: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  gameWrap: { gap: spacing.sm },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hudScore: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hudScoreText: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  hudTime: { color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  field: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  groundLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: GROUND_Y,
    height: 4,
    backgroundColor: '#74C4A9',
  },
  dog: {
    position: 'absolute',
    left: DOG_X * 3.4,
    bottom: GROUND_Y + 2,
    width: DOG_W * 8,
    alignItems: 'center',
  },
  dogRing: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  obstacle: { position: 'absolute' },
  commentator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  commentatorAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  commentatorBubble: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  commentatorText: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  doneWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  doneLabel: { color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  doneScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doneScore: { color: colors.text, fontSize: 56, fontWeight: typography.weight.bold },
  doneBest: { color: colors.accent, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  doneBestPlain: { color: colors.textSecondary, fontSize: typography.size.sm },
  doneRank: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  doneBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  doneLine: { color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.medium, textAlign: 'center' },
  doneLineAuthor: { color: colors.textMuted, fontSize: typography.size.xs },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  shareButtonText: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  pressed: { opacity: 0.88 },
});

/**
 * "Agility Oreo" — runner rifatto: mondo in parallasse a 3 strati che
 * scorre (il cane sta fermo, è il mondo a muoversi), AvatarActor con
 * bob di corsa e salto squash&stretch (+ polvere all'atterraggio), ossi
 * bonus in arcata, ostacoli con bandierine e tunnel semi-trasparente,
 * near-miss "Per un pelo!", crash con rallenty. Telecronista AvatarActor.
 * Logica pura in features/games/agilityLogic.ts (RNG iniettato, test).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { AvatarActor, type BuddyExpression } from '@/features/core/AvatarActor';
import {
  AGILITY_COMBO_LINE,
  AGILITY_JUMP_LINES,
  AGILITY_LIVES,
  AGILITY_START_LINE,
  AGILITY_TUNNEL_LINE,
  DOG_W,
  DOG_X,
  JUMP_MS,
  JUMP_HEIGHT_U,
  OBSTACLE_DIMS,
  agilityEndgameLine,
  boneCollected,
  bonusBoneX,
  buildAgilitySchedule,
  buildBonusArcs,
  buildAgilitySchedule as extendSchedule,
  collides,
  isCleared,
  isCombo,
  isInvulnerable,
  isGameOver,
  isNearMiss,
  jumpHeightAt,
  livesAfterCrash,
  loadAgilityBest,
  obstacleX,
  pointsForClear,
  saveAgilityBest,
  speedAt,
  type AgilityObstacle,
  type BonusArc,
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
const GROUND_Y = 30;
const UNIT_H = 5.2;
const CRASH_SLOWMO_MS = 320;

const FAR_HILLS =
  'M0 30 C120 10 240 38 380 24 C500 14 620 34 760 22 L760 90 L0 90 Z';
const NEAR_HILLS =
  'M0 48 C160 30 320 54 480 44 C600 36 700 50 760 44 L760 90 L0 90 Z';

/** Strato di parallasse: scorre con fattore proprio, loop su 760u. */
function ParallaxLayer({
  worldX,
  factor,
  children,
}: {
  worldX: SharedValue<number>;
  factor: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (worldX.value * factor) % 380 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.parallax, style]}>
      {children}
      <View style={styles.parallaxClone}>{children}</View>
    </Animated.View>
  );
}

function CloudPuff({ top, left, scale }: { top: number; left: number; scale: number }) {
  return (
    <View style={[styles.cloud, { top, left, transform: [{ scale }] }]} pointerEvents="none">
      <View style={styles.cloudBump} />
      <View style={styles.cloudBase} />
    </View>
  );
}

/** Ostacoli: muretto con bandierine, birilli arancio/bianchi, tunnel soft. */
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
          fillOpacity={0.55}
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
        d={`M${x} ${h} L${x + w * 0.14} ${h * 0.12} L${x + w * 0.28} ${h} Z`}
        fill="#F5A623"
        stroke={colors.text}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    );
    const stripe = (x: number) => (
      <Path
        key={`s${x}`}
        d={`M${x + w * 0.06} ${h * 0.62} l${w * 0.16} 0 l${w * 0.02} ${h * 0.16} l-${w * 0.2} 0 Z`}
        fill="#FFFFFF"
      />
    );
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {cone(2)}
        {cone(w * 0.36)}
        {cone(w * 0.7)}
        {stripe(2)}
        {stripe(w * 0.36)}
        {stripe(w * 0.7)}
      </Svg>
    );
  }
  return (
    <Svg width={w} height={h + 14} viewBox={`0 0 ${w} ${h + 14}`}>
      <Rect x={2} y={14} width={4} height={h} fill={colors.text} />
      <Rect x={w - 6} y={14} width={4} height={h} fill={colors.text} />
      <Rect x={0} y={h * 0.3} width={w} height={7} rx={3} fill={colors.accent} />
      <Rect x={0} y={h * 0.62} width={w} height={7} rx={3} fill={colors.textOnPrimary} stroke={colors.text} strokeWidth={2} />
      {/* bandierine */}
      <Path d={`M4 14 v-12 l10 4 Z`} fill="#FF8B74" stroke={colors.text} strokeWidth={1.6} />
      <Path d={`M${w - 4} 14 v-12 l-10 4 Z`} fill="#F6C94C" stroke={colors.text} strokeWidth={1.6} />
    </Svg>
  );
}

/** Ossicino bonus SVG. */
function BonusBoneArt() {
  return (
    <Svg width={26} height={18} viewBox="0 0 34 22">
      <Path
        d="M7 3 C4 0 0 3 2 7 C0 10 4 13 7 10 L25 10 C28 13 32 10 30 7 C32 3 28 0 25 3 Z"
        fill="#FFF6EC"
        stroke={colors.text}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Polvere all'atterraggio. */
function LandingDust({ tick }: { tick: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
  }, [tick, progress]);
  const left = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: -18 * progress.value },
      { translateY: -6 * progress.value },
      { scale: 0.6 + progress.value * 0.7 },
    ],
  }));
  const right = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: 18 * progress.value },
      { translateY: -6 * progress.value },
      { scale: 0.6 + progress.value * 0.7 },
    ],
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.dust, left]} />
      <Animated.View pointerEvents="none" style={[styles.dust, right]} />
    </>
  );
}

/** Cuori delle vite: duotone, si svuotano con un pop. */
function LivesHud({ lives }: { lives: number }) {
  return (
    <View style={styles.lives} accessibilityLabel={`${lives} vite rimaste`}>
      {[0, 1, 2].map((index) => (
        <Heart key={`${index}-${lives > index}`} filled={lives > index} />
      ))}
    </View>
  );
}

function Heart({ filled }: { filled: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (filled) return;
    scale.value = withSequence(
      withTiming(1.35, { duration: 130, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }),
    );
  }, [filled, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: filled ? 1 : 0.35,
  }));
  return (
    <Animated.View style={style}>
      <Svg width={26} height={24} viewBox="0 0 26 24">
        <Path
          d="M13 22 C6 16.5 2.5 12.6 2.5 8.6 C2.5 5 5 2.7 8 2.7 C10 2.7 11.9 3.9 13 5.8 C14.1 3.9 16 2.7 18 2.7 C21 2.7 23.5 5 23.5 8.6 C23.5 12.6 20 16.5 13 22 Z"
          fill={filled ? '#FF8B74' : colors.surfaceMuted}
          stroke={colors.text}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** Il cane che corre: bob + tilt; salto con squash&stretch. */
function RunningDog({
  photoUri,
  dogName,
  jumpY,
  crashed,
  inTunnel,
  invulnerable,
  reducedMotion,
}: {
  photoUri: string | null;
  dogName: string;
  jumpY: SharedValue<number>;
  crashed: boolean;
  inTunnel: boolean;
  invulnerable: boolean;
  reducedMotion: boolean;
}) {
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || crashed) return;
    bob.value = withSequence(
      withTiming(1, { duration: 110, easing: Easing.inOut(Easing.sin) }),
    );
    const interval = setInterval(() => {
      bob.value = 0;
      bob.value = withTiming(1, { duration: 220, easing: Easing.inOut(Easing.sin) });
    }, 240);
    return () => clearInterval(interval);
  }, [reducedMotion, crashed, bob]);

  const style = useAnimatedStyle(() => {
    const y = jumpY.value;
    const airborne = y > 0.5;
    const rising = airborne && y < JUMP_HEIGHT_U * 0.75;
    const flash = invulnerable ? (Math.sin(Date.now() / 90) > 0 ? 0.35 : 0.8) : 1;
    return {
      opacity: (inTunnel ? 0.4 : 1) * flash,
      transform: [
        { translateY: -y * UNIT_H - bob.value * 5 },
        { rotate: crashed ? '0deg' : `${airborne ? -6 : 3}deg` },
        { scaleY: rising ? 1.12 : airborne ? 1 : 0.98 },
        { scaleX: rising ? 0.94 : 1 },
      ],
    };
  }, [inTunnel, crashed, invulnerable]);

  return (
    <Animated.View pointerEvents="none" style={[styles.dog, style]}>
      {crashed ? (
        <AvatarActor size={76} expression="sad" animate={false} photoUri={photoUri} dogName={dogName} />
      ) : (
        <AvatarActor size={76} expression="happy" photoUri={photoUri} dogName={dogName} />
      )}
    </Animated.View>
  );
}

/** Buddy telecronista (pattern condiviso). */
function Commentator({
  photoUri,
  dogName,
  line,
  expression,
}: {
  photoUri: string | null;
  dogName: string;
  line: { id: number; text: string } | null;
  expression: BuddyExpression;
}) {
  return (
    <View style={styles.commentator} pointerEvents="none">
      <View style={styles.commentatorAvatar}>
        <AvatarActor size={46} expression={expression} photoUri={photoUri} dogName={dogName} />
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
  const [activeArcs, setActiveArcs] = useState<BonusArc[]>([]);
  const [collectedBones, setCollectedBones] = useState<ReadonlySet<string>>(new Set());
  const [crashed, setCrashed] = useState(false);
  const [lives, setLives] = useState(AGILITY_LIVES);
  const [invulnerable, setInvulnerable] = useState(false);
  const [inTunnel, setInTunnel] = useState(false);
  const [nearMiss, setNearMiss] = useState<{ id: number } | null>(null);
  const [landingTick, setLandingTick] = useState(0);
  const [commentary, setCommentary] = useState<{ id: number; text: string } | null>(null);
  const [expression, setExpression] = useState<BuddyExpression>('focused');
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);
  const [shownScore, setShownScore] = useState(0);

  const schedule = useRef<AgilityObstacle[]>([]);
  const arcs = useRef<BonusArc[]>([]);
  const startedAt = useRef(0);
  const crashAt = useRef<number | null>(null);
  const lastHitAt = useRef<number | null>(null);
  const livesRef = useRef(AGILITY_LIVES);
  const jumpStart = useRef<number | null>(null);
  const clearedIds = useRef<Set<number>>(new Set());
  const streak = useRef(0);
  const commentarySeq = useRef(0);
  const commentaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fieldWidth = useRef(360);
  const nearMissSeq = useRef(0);

  const jumpAnim = useSharedValue(0);
  const worldX = useSharedValue(0);

  useEffect(() => {
    void loadAgilityBest(dog.id).then(setBest);
    return () => {
      timeouts.current.forEach(clearTimeout);
      if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    };
  }, [dog.id]);

  const say = (text: string, next: BuddyExpression = 'focused') => {
    commentarySeq.current += 1;
    setCommentary({ id: commentarySeq.current, text });
    setExpression(next);
    if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    commentaryTimer.current = setTimeout(() => setCommentary(null), 1800);
  };

  const later = (ms: number, fn: () => void) => {
    timeouts.current.push(setTimeout(fn, ms));
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
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    schedule.current = buildAgilitySchedule(Math.random);
    arcs.current = buildBonusArcs(schedule.current, Math.random);
    startedAt.current = Date.now();
    crashAt.current = null;
    jumpStart.current = null;
    clearedIds.current = new Set();
    streak.current = 0;
    jumpAnim.value = 0;
    worldX.value = 0;
    setScore(0);
    setElapsed(0);
    setActiveObstacles([]);
    setActiveArcs([]);
    setCollectedBones(new Set());
    setCrashed(false);
    livesRef.current = AGILITY_LIVES;
    setLives(AGILITY_LIVES);
    setInvulnerable(false);
    lastHitAt.current = null;
    setInTunnel(false);
    setNearMiss(null);
    setWeekRank(null);
    setShareDone(false);
    setPhase('playing');
    say(AGILITY_START_LINE, 'focused');
  };

  const jump = () => {
    if (phase !== 'playing' || crashed) return;
    const now = Date.now() - startedAt.current;
    if (jumpStart.current !== null && now - jumpStart.current < JUMP_MS) return;
    const wasGrounded = jumpStart.current === null || now - jumpStart.current >= JUMP_MS;
    jumpStart.current = now;
    if (!reducedMotion) {
      jumpAnim.value = 0;
      jumpAnim.value = withSequence(
        withTiming(JUMP_HEIGHT_U, { duration: JUMP_MS / 2, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: JUMP_MS / 2, easing: Easing.in(Easing.quad) }),
      );
      if (wasGrounded) {
        later(JUMP_MS, () => setLandingTick((tick) => tick + 1));
      }
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

  // Driver di gioco (JS thread, tick 50ms): mondo, ostacoli, ossi, collisioni.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);
      // Niente timer: la partita va avanti finché ci sono vite. La schedule
      // si estende a chunk di 60s quando il fondo si avvicina.
      const lastSpawn = schedule.current[schedule.current.length - 1];
      if (lastSpawn && now > lastSpawn.spawnAtMs - 6000) {
        schedule.current = schedule.current.concat(
          extendSchedule(Math.random, lastSpawn.spawnAtMs + 60_000, {
            startAtMs: lastSpawn.spawnAtMs + 1,
            startId: lastSpawn.id + 1,
          }),
        );
      }
      // Rallenty sul crash prima della fine.
      const slowmo =
        crashAt.current !== null && now - crashAt.current < CRASH_SLOWMO_MS ? 0.25 : 1;
      worldX.value = -(now / 1000) * speedAt(now) * slowmo;

      const dogY = jumpHeightAt(jumpStart.current, now);
      const flashing = isInvulnerable(lastHitAt.current, now);
      setInvulnerable(flashing);

      if (!crashed && !flashing) {
        for (const obstacle of schedule.current) {
          if (
            obstacle.spawnAtMs <= now &&
            !clearedIds.current.has(obstacle.id) &&
            collides(dogY, obstacle, now)
          ) {
            clearedIds.current.add(obstacle.id);
            lastHitAt.current = now;
            const nextLives = livesAfterCrash(livesRef.current);
            livesRef.current = nextLives;
            setLives(nextLives);
            if (isGameOver(nextLives)) {
              crashAt.current = now;
              setCrashed(true);
              say('Ahi! Mi siedo un attimo…', 'sad');
              clearInterval(timer);
              later(900, finish);
            } else {
              say(
                nextLives === 1
                  ? 'Ultima vita, con calma!'
                  : `Ops! Ancora ${nextLives} vite!`,
                'sad',
              );
            }
            return;
          }
        }
        // Dentro il tunnel (a terra): cane semi-trasparente.
        const tunnel = schedule.current.find(
          (obstacle) =>
            obstacle.kind === 'tunnel' &&
            obstacle.spawnAtMs <= now &&
            !clearedIds.current.has(obstacle.id) &&
            obstacleX(obstacle, now) < DOG_X + DOG_W &&
            obstacleX(obstacle, now) + OBSTACLE_DIMS.tunnel.w > DOG_X,
        );
        setInTunnel(Boolean(tunnel) && dogY <= 2);

        // Ossi bonus.
        for (const arc of arcs.current) {
          for (let b = 0; b < arc.bones.length; b += 1) {
            const key = `${arc.id}:${b}`;
            const bone = arc.bones[b];
            const x = bonusBoneX(arc, bone, now);
            if (!collectedBones.has(key) && x > -6 && boneCollected(dogY, bone.y, x)) {
              setCollectedBones((previous) => new Set(previous).add(key));
              setScore((value) => value + 1);
            }
          }
        }
      }

      // Clear, punteggio, near-miss.
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
          if (isNearMiss(dogY, obstacle.kind)) {
            nearMissSeq.current += 1;
            setNearMiss({ id: nearMissSeq.current });
            later(700, () => setNearMiss(null));
          }
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
      setActiveArcs(
        arcs.current.filter((arc) => bonusBoneX(arc, { dx: 0, y: 0 }, now) > -24),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, crashed, dog.id, realEnabled, collectedBones]);

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
            Il tunnel NO: ci passi dentro da solo.{'\n'}
            Raccogli gli ossicini in salto: valgono punti!
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
          <Commentator photoUri={dog.photoUri} dogName={dog.name} line={commentary} expression={expression} />
          <View style={styles.hud}>
            <View style={styles.hudScore} accessibilityLabel={`Punteggio ${score}`}>
              <CuteIcon name="paw" size={16} color={colors.accent} secondary={colors.accent} />
              <Text style={styles.hudScoreText}>{score}</Text>
            </View>
            <LivesHud lives={lives} />
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
              colors={['#BFE3F7', '#DDF0FB', '#EAF7F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* strato lontano: nuvole */}
            <ParallaxLayer worldX={worldX} factor={0.12}>
              <CloudPuff top={18} left={40} scale={0.8} />
              <CloudPuff top={34} left={230} scale={1.05} />
              <CloudPuff top={10} left={420} scale={0.7} />
            </ParallaxLayer>
            {/* colline lontane */}
            <ParallaxLayer worldX={worldX} factor={0.32}>
              <Svg width={760} height={90} viewBox="0 0 760 90" style={styles.hillsFar}>
                <Path d={FAR_HILLS} fill="#A9DCCF" />
              </Svg>
            </ParallaxLayer>
            {/* primo piano */}
            <ParallaxLayer worldX={worldX} factor={1}>
              <Svg width={760} height={90} viewBox="0 0 760 90" style={styles.hillsNear}>
                <Path d={NEAR_HILLS} fill="#74C4A9" />
              </Svg>
            </ParallaxLayer>

            <View style={styles.groundLine} pointerEvents="none" />

            {/* ossi bonus */}
            {activeArcs.map((arc) =>
              arc.bones.map((bone, b) => {
                const key = `${arc.id}:${b}`;
                if (collectedBones.has(key)) return null;
                const x = bonusBoneX(arc, bone, elapsed);
                if (x < -6 || x > 110) return null;
                return (
                  <View
                    key={key}
                    pointerEvents="none"
                    style={[
                      styles.bone,
                      { left: x * unitX, bottom: GROUND_Y + bone.y * UNIT_H },
                    ]}
                  >
                    <BonusBoneArt />
                  </View>
                );
              }),
            )}

            {/* ostacoli */}
            {activeObstacles.map((obstacle) => (
              <View
                key={obstacle.id}
                pointerEvents="none"
                style={[
                  styles.obstacle,
                  { left: obstacleX(obstacle, elapsed) * unitX, bottom: GROUND_Y },
                ]}
              >
                <ObstacleArt kind={obstacle.kind} />
              </View>
            ))}

            {landingTick > 0 && !reducedMotion ? (
              <View pointerEvents="none" style={styles.dustAnchor}>
                <LandingDust tick={landingTick} />
              </View>
            ) : null}

            <RunningDog
              photoUri={dog.photoUri}
              dogName={dog.name}
              jumpY={jumpAnim}
              crashed={crashed}
              inTunnel={inTunnel}
              invulnerable={invulnerable}
              reducedMotion={reducedMotion}
            />

            {nearMiss ? (
              <Animated.View
                key={nearMiss.id}
                entering={FadeIn.duration(140)}
                style={styles.nearMiss}
                pointerEvents="none"
              >
                <Text style={styles.nearMissText}>Per un pelo!</Text>
              </Animated.View>
            ) : null}
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
          <AvatarActor size={88} expression={score > 8 ? 'celebrate' : 'sad'} photoUri={dog.photoUri} dogName={dog.name} />
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
  lives: { flexDirection: 'row', gap: 4 },
  field: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  parallax: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '200%',
    flexDirection: 'row',
  },
  parallaxClone: { position: 'absolute', left: 380, top: 0, bottom: 0, right: 0 },
  cloud: { position: 'absolute', width: 56, height: 20 },
  cloudBase: {
    position: 'absolute',
    bottom: 0,
    width: 56,
    height: 13,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  cloudBump: {
    position: 'absolute',
    bottom: 8,
    left: 14,
    width: 26,
    height: 22,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  hillsFar: { position: 'absolute', bottom: 20, left: 0 },
  hillsNear: { position: 'absolute', bottom: -4, left: 0 },
  groundLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: GROUND_Y,
    height: 4,
    backgroundColor: '#5FAE95',
  },
  dog: {
    position: 'absolute',
    left: DOG_X * 3.4,
    bottom: GROUND_Y + 2,
    width: DOG_W * 8,
    alignItems: 'center',
  },
  obstacle: { position: 'absolute' },
  bone: { position: 'absolute' },
  dustAnchor: {
    position: 'absolute',
    left: DOG_X * 3.4 + 20,
    bottom: GROUND_Y,
  },
  dust: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(190, 160, 120, 0.55)',
  },
  nearMiss: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...shadows.card,
  },
  nearMissText: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
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

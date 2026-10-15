/**
 * "Scoiattolo!" — mini-gioco arcade (30s). Gli scoiattoli sbucano dalle
 * buche su un prato a colline (estetica DogHero): tap = punti, dorato = +3,
 * riccio amico = mai toccarlo (−2 gentile). Il cane "scatta" verso la buca
 * colpita. Logica pura in features/games/squirrelLogic.ts (RNG iniettato,
 * test in src/__tests__/squirrelGame.test.ts). Reduce-motion → niente
 * spring/wiggle, il gioco resta giocabile.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
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
import { BuddyMascot, type BuddyExpression } from '@/features/mascot/BuddyMascot';
import { SquirrelArt, type SquirrelArtVariant } from '@/features/games/squirrelArt';
import {
  COMMENTARY_FINAL_SECONDS,
  COMMENTARY_MISS_LINES,
  COMMENTARY_START,
  SQUIRREL_GAME_DURATION_MS,
  SQUIRREL_HOLES,
  applyScore,
  buildSpawnSchedule,
  commentaryFor,
  loadSquirrelBest,
  saveSquirrelBest,
  squirrelEndgameLine,
  type CreatureKind,
  type SpawnEvent,
} from '@/features/games/squirrelLogic';
import { fetchGameLeaderboard, submitGameScore } from '@/features/games/api';
import { shareSquirrelResult } from '@/features/games/shareScoreCard';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { isPersistedId } from '@/lib/persistedId';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

type Phase = 'intro' | 'playing' | 'done';

type ActiveCreature = {
  spawn: SpawnEvent;
  caught: 'none' | 'hit' | 'missed';
};

type Popup = {
  id: number;
  holeIndex: number;
  text: string;
  kind: CreatureKind;
};

const HILLS = [
  'M0 40 C120 22 240 48 380 36 C500 26 620 44 760 34 L760 90 L0 90 Z',
  'M0 62 C160 46 320 68 480 58 C600 50 700 62 760 56 L760 90 L0 90 Z',
] as const;
const HILL_COLORS = ['#9BD8CB', '#74C4A9'] as const;

const CREATURE_LABEL: Record<CreatureKind, string> = {
  squirrel: 'Scoiattolo: toccalo!',
  golden: 'Scoiattolo dorato: vale tre punti!',
  hedgehog: 'Riccio amico: non toccarlo!',
};

/** Scoiattolo che sbuca dalla buca: spring in salita, wiggle, outro squash. */
function HoleCreature({
  spawn,
  caught,
  reducedMotion,
}: {
  spawn: SpawnEvent;
  caught: ActiveCreature['caught'];
  reducedMotion: boolean;
}) {
  const rise = useSharedValue(reducedMotion ? 1 : 0);
  const wiggle = useSharedValue(0);
  const outro = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      rise.value = 1;
      return;
    }
    rise.value = withSpring(1, { damping: 9, stiffness: 260, mass: 0.7 });
    wiggle.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 240, easing: Easing.inOut(Easing.sin) }),
        withTiming(3, { duration: 240, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, rise, wiggle]);

  useEffect(() => {
    if (caught === 'none') return;
    outro.value = reducedMotion
      ? 1
      : withTiming(1, { duration: 200, easing: Easing.in(Easing.quad) });
  }, [caught, reducedMotion, outro]);

  const style = useAnimatedStyle(() => {
    const up = rise.value;
    const out = outro.value;
    return {
      opacity: 1 - out * (caught === 'hit' ? 1 : 0.6),
      transform: [
        { translateY: (1 - up) * 72 + out * 44 },
        { rotate: `${wiggle.value}deg` },
        { scaleY: up * (1 - out * 0.35) },
        { scaleX: up * (1 + out * 0.25) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.creature, style]}>
      <SquirrelArt variant={spawn.kind as SquirrelArtVariant} size={66} />
    </Animated.View>
  );
}

/** Popup punteggio che fluttuando svanisce sopra la buca. */
function ScorePopup({ popup, reducedMotion }: { popup: Popup; reducedMotion: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reducedMotion
      ? 1
      : withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) });
  }, [reducedMotion, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -44 * progress.value }],
  }));
  const negative = popup.kind === 'hedgehog';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.popup,
        negative ? styles.popupBad : popup.kind === 'golden' ? styles.popupGold : styles.popupGood,
        style,
      ]}
    >
      <Text
        style={[
          styles.popupText,
          negative ? styles.popupTextBad : popup.kind === 'golden' ? styles.popupTextGold : null,
        ]}
      >
        {popup.text}
      </Text>
    </Animated.View>
  );
}

/** Buddy telecronista: mascotte + fumetto di reazione (fade, max ~2s). */
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

/** Fiorellini statici sul prato (decorazione, nessuna animazione). */
function FieldFlowers() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMax slice"
    >
      {[
        { x: 36, y: 236, c: '#F5A8C0' },
        { x: 178, y: 268, c: '#FFFFFF' },
        { x: 330, y: 244, c: '#F5C94C' },
        { x: 96, y: 320, c: '#FFFFFF' },
        { x: 262, y: 330, c: '#F5A8C0' },
        { x: 366, y: 312, c: '#FFFFFF' },
      ].map((flower, index) => (
        <Path
          key={index}
          d={`M${flower.x} ${flower.y} m0 -4 c2 -3 6 -1 4 2 c3 -2 5 2 2 4 c2 3 -2 6 -4 3 c-2 3 -6 1 -4 -2 c-3 2 -5 -2 -2 -4 c-2 -3 2 -6 4 -1 Z`}
          fill={flower.c}
          opacity={0.85}
        />
      ))}
    </Svg>
  );
}

export default function SquirrelGameScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('intro');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [active, setActive] = useState<ReadonlyMap<number, ActiveCreature>>(new Map());
  const [popups, setPopups] = useState<Popup[]>([]);
  const [commentary, setCommentary] = useState<{ id: number; text: string } | null>(null);
  const [expression, setExpression] = useState<BuddyExpression>('focused');
  const [shownScore, setShownScore] = useState(0);
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);

  const { userId, usingMockGate } = useSession();
  const realEnabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);
  const commentarySeq = useRef(0);
  const commentaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saidFinalSeconds = useRef(false);

  const schedule = useRef<SpawnEvent[]>([]);
  const startedAt = useRef(0);
  const popupSeq = useRef(0);
  const lastMissCommentAt = useRef(0);

  const say = (text: string, next: BuddyExpression = 'focused') => {
    commentarySeq.current += 1;
    setCommentary({ id: commentarySeq.current, text });
    setExpression(next);
    if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    commentaryTimer.current = setTimeout(() => setCommentary(null), 2000);
  };

  useEffect(() => {
    void loadSquirrelBest(dog.id).then(setBest);
  }, [dog.id]);

  const timeBar = useSharedValue(0);
  const timeBarStyle = useAnimatedStyle(() => ({
    width: `${(1 - timeBar.value) * 100}%`,
  }));

  const startGame = () => {
    schedule.current = buildSpawnSchedule(Math.random);
    startedAt.current = Date.now();
    setScore(0);
    setElapsed(0);
    setActive(new Map());
    setPopups([]);
    setWeekRank(null);
    setShareDone(false);
    setPhase('playing');
    saidFinalSeconds.current = false;
    say(COMMENTARY_START, 'focused');
    timeBar.value = 0;
    timeBar.value = withTiming(1, {
      duration: SQUIRREL_GAME_DURATION_MS,
      easing: Easing.linear,
    });
  };

  // Driver di gioco (JS thread, tick 100ms): attiva e fa scadere gli spawn.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);
      if (
        !saidFinalSeconds.current &&
        now >= SQUIRREL_GAME_DURATION_MS - 5000 &&
        now < SQUIRREL_GAME_DURATION_MS
      ) {
        saidFinalSeconds.current = true;
        say(COMMENTARY_FINAL_SECONDS, 'focused');
      }
      if (now >= SQUIRREL_GAME_DURATION_MS) {
        clearInterval(timer);
        setActive(new Map());
        setPhase('done');
        setScore((finalScore) => {
          void saveSquirrelBest(finalScore, dog.id).then(setBest);
          if (realEnabled) {
            setSubmitting(true);
            void (async () => {
              try {
                await submitGameScore(dog.id, finalScore);
                const board = await fetchGameLeaderboard();
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
        return;
      }
      setActive((previous) => {
        const next = new Map(previous);
        for (const spawn of schedule.current) {
          const existing = next.get(spawn.holeIndex);
          if (
            !existing &&
            spawn.spawnAtMs <= now &&
            now <= spawn.spawnAtMs + spawn.visibleMs &&
            ![...next.values()].some((entry) => entry.spawn.id === spawn.id)
          ) {
            next.set(spawn.holeIndex, { spawn, caught: 'none' });
          } else if (
            existing &&
            existing.caught === 'none' &&
            now > existing.spawn.spawnAtMs + existing.spawn.visibleMs
          ) {
            next.set(existing.spawn.holeIndex, { ...existing, caught: 'missed' });
            if (
              now - lastMissCommentAt.current > 4200 &&
              Math.random() < 0.35
            ) {
              lastMissCommentAt.current = now;
              const line =
                COMMENTARY_MISS_LINES[
                  Math.floor(Math.random() * COMMENTARY_MISS_LINES.length)
                ];
              say(line, 'neutral');
            }
          }
          // pulizia creature in uscita
          if (
            existing &&
            existing.caught !== 'none' &&
            now > existing.spawn.spawnAtMs + existing.spawn.visibleMs + 350
          ) {
            next.delete(existing.spawn.holeIndex);
          }
        }
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [phase, dog.id]);

  // Count-up del punteggio finale.
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

  const onHolePress = (holeIndex: number) => {
    if (phase !== 'playing') return;
    const entry = active.get(holeIndex);
    if (!entry || entry.caught !== 'none') return;
    popupSeq.current += 1;
    setScore((value) => applyScore(value, entry.spawn.kind));
    say(
      commentaryFor(entry.spawn.kind),
      entry.spawn.kind === 'hedgehog'
        ? 'sad'
        : entry.spawn.kind === 'golden'
          ? 'celebrate'
          : 'happy',
    );
    setPopups((list) => [
      ...list,
      {
        id: popupSeq.current,
        holeIndex,
        kind: entry.spawn.kind,
        text:
          entry.spawn.kind === 'hedgehog'
            ? '−2 · è un amico!'
            : entry.spawn.kind === 'golden'
              ? '+3'
              : '+1',
      },
    ]);
    setActive((previous) => {
      const next = new Map(previous);
      next.set(holeIndex, { ...entry, caught: 'hit' });
      return next;
    });
    const popupId = popupSeq.current;
    setTimeout(
      () => setPopups((list) => list.filter((popup) => popup.id !== popupId)),
      900,
    );
  };

  const remainingSeconds = Math.max(
    0,
    Math.ceil((SQUIRREL_GAME_DURATION_MS - elapsed) / 1000),
  );

  const holes = useMemo(() => Array.from({ length: SQUIRREL_HOLES }, (_, i) => i), []);

  return (
    <ScreenContainer scroll={phase !== 'playing'}>
      <StackScreenHeader title="Scoiattolo!" />

      {phase === 'intro' ? (
        <View style={styles.introWrap}>
          <View style={styles.introArt}>
            <SquirrelArt size={120} />
            <SquirrelArt variant="golden" size={72} />
            <SquirrelArt variant="hedgehog" size={72} />
          </View>
          <Text style={styles.introTitle}>Acchiappa gli scoiattoli!</Text>
          <Text style={styles.introText}>
            Sbucano dalle buche per 30 secondi: toccali prima che rientrino.{'\n'}
            Quello <Text style={styles.introGold}>dorato</Text> vale triplo.{'\n'}
            Il riccio è un amico: se lo tocchi, ciao punti.
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
            <View
              style={styles.timeBarTrack}
              accessibilityLabel={`${remainingSeconds} secondi rimasti`}
            >
              <Animated.View style={[styles.timeBarFill, timeBarStyle]} />
            </View>
            <Text style={styles.hudTime}>{remainingSeconds}s</Text>
          </View>

          <View style={styles.field}>
            <LinearGradient
              colors={['#D9ECFB', '#E7F5EE', '#DFF3EC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FieldFlowers />
            {HILLS.map((d, index) => (
              <View key={index} pointerEvents="none" style={styles.hill}>
                <Svg width={760} height={90} viewBox="0 0 760 90">
                  <Path d={d} fill={HILL_COLORS[index]} />
                </Svg>
              </View>
            ))}

            <View style={styles.holesGrid}>
              {holes.map((holeIndex) => {
                const entry = active.get(holeIndex);
                return (
                  <Pressable
                    key={holeIndex}
                    accessibilityRole="button"
                    accessibilityLabel={
                      entry && entry.caught === 'none'
                        ? CREATURE_LABEL[entry.spawn.kind]
                        : `Buca ${holeIndex + 1}, vuota`
                    }
                    onPress={() => onHolePress(holeIndex)}
                    style={styles.holeCell}
                  >
                    <View style={styles.riserClip} pointerEvents="none">
                      {entry ? (
                        <HoleCreature
                          spawn={entry.spawn}
                          caught={entry.caught}
                          reducedMotion={reducedMotion}
                        />
                      ) : null}
                    </View>
                    <View style={styles.holeShadow} pointerEvents="none" />
                    <View style={styles.holeLip} pointerEvents="none" />
                    {popups
                      .filter((popup) => popup.holeIndex === holeIndex)
                      .map((popup) => (
                        <ScorePopup key={popup.id} popup={popup} reducedMotion={reducedMotion} />
                      ))}
                  </Pressable>
                );
              })}
            </View>

          </View>
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
          <BuddyMascot size={88} expression={score > 5 ? 'celebrate' : 'sad'} />
          <View style={styles.doneBubble}>
            <Text style={styles.doneLine}>{squirrelEndgameLine(score)}</Text>
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
                {shareDone
                  ? 'Condiviso!'
                  : sharing
                    ? 'Condivido…'
                    : 'Condividi nelle storie'}
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
  introWrap: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  introArt: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
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
  introGold: { color: '#B45309', fontWeight: typography.weight.bold },
  introBest: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
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
  secondaryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  gameWrap: { gap: spacing.md },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hudScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hudScoreText: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  timeBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  timeBarFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  hudTime: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    minWidth: 30,
    textAlign: 'right',
  },
  field: {
    height: 400,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  hill: {
    position: 'absolute',
    bottom: -4,
    left: -60,
  },
  holesGrid: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 74,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  holeCell: {
    width: '33.33%',
    height: 84,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  riserClip: {
    position: 'absolute',
    bottom: 22,
    width: 80,
    height: 82,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  creature: {
    position: 'absolute',
    bottom: 0,
  },
  holeShadow: {
    width: 72,
    height: 24,
    borderRadius: 36,
    backgroundColor: '#4A3320',
    borderWidth: 3,
    borderColor: '#6B4A2F',
  },
  holeLip: {
    position: 'absolute',
    bottom: -2,
    width: 82,
    height: 13,
    borderRadius: 41,
    backgroundColor: '#7A5A3A',
    opacity: 0.95,
  },
  popup: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    ...shadows.card,
  },
  popupGood: { backgroundColor: colors.surface },
  popupGold: { backgroundColor: '#FFF3D6' },
  popupBad: { backgroundColor: colors.surface },
  popupText: {
    color: colors.accent,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  popupTextGold: {
    color: '#D18F00',
  },
  popupTextBad: {
    color: colors.danger,
    fontSize: typography.size.sm,
  },
  dogPlayer: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    marginLeft: -46,
    alignItems: 'center',
  },
  dogRing: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  doneWrap: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  doneLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  doneScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  doneScore: {
    color: colors.text,
    fontSize: 56,
    fontWeight: typography.weight.bold,
  },
  doneBest: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  doneBestPlain: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
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
  doneLine: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  doneLineAuthor: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
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
  commentatorText: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  doneRank: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
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
  shareButtonText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.88 },
});

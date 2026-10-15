/**
 * "Bau Match" — Match-3 Dogly (griglia 6×7, Blitz 60s). Tap-tap per
 * scambiare tessere adiacenti; 3+ in linea scoppiano con cascata e
 * moltiplicatore crescente; linee da 4+ = razzo (riga/colonna intera).
 * Buddy telecronista. Logica pura in features/games/matchLogic.ts
 * (deterministica con RNG iniettato, test dedicati).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CuteIcon as PawIcon } from '@/components/CuteIcon';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  type SharedValue,
  FadeIn,
  SlideInDown,
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
import { AvatarActor, type BuddyExpression } from '@/features/core/AvatarActor';
import { MatchPiece } from '@/features/games/matchPieces';
import {
  MATCH_BLITZ_MS,
  MATCH_CHAIN_LINES,
  MATCH_COLS,
  MATCH_FINAL_SECONDS,
  MATCH_RESHUFFLE_LINE,
  MATCH_ROCKET_LINE,
  MATCH_ROWS,
  MATCH_START_LINE,
  chainScore,
  findClears,
  hasAnyMove,
  indexOf,
  isValidSwap,
  loadMatchBest,
  matchEndgameLine,
  randomBoard,
  removeDropRefill,
  reshuffle,
  saveMatchBest,
  swapCells,
  type Board,
} from '@/features/games/matchLogic';
import { fetchGameLeaderboard, submitGameScore } from '@/features/games/api';
import { shareSquirrelResult } from '@/features/games/shareScoreCard';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { isPersistedId } from '@/lib/persistedId';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

type Phase = 'intro' | 'playing' | 'done';

function rowOf(index: number): number {
  return Math.floor(index / MATCH_COLS);
}

/** Buddy telecronista (pattern condiviso con gli altri giochi). */
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

/** Mini-burst di zampine quando una tessera scoppia. */
function ClearBurst({ cellSize, seed }: { cellSize: number; seed: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
  }, [progress]);
  const particles = useMemo(() => {
    const rand = (n: number) => {
      const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: 5 }, (_, i) => ({
      dx: (rand(i) - 0.5) * cellSize * 1.7,
      dy: -(rand(i + 5) * cellSize * 1.1 + 8),
      delay: i * 28,
    }));
  }, [cellSize, seed]);
  return (
    <>
      {particles.map((particle, i) => (
        <BurstPaw key={i} progress={progress} particle={particle} />
      ))}
    </>
  );
}

function BurstPaw({
  progress,
  particle,
}: {
  progress: SharedValue<number>;
  particle: { dx: number; dy: number; delay: number };
}) {
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.value * 1.3 - particle.delay / 480));
    return {
      opacity: 1 - local,
      transform: [
        { translateX: particle.dx * local },
        { translateY: particle.dy * local },
        { scale: 1 - local * 0.5 },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <PawIcon name="paw" size={10} color={colors.accent} secondary={colors.accent} />
    </Animated.View>
  );
}

/** Cella della griglia: caduta dall'alto, pulse allo swap, wiggle se invalida. */
function Cell({
  index,
  piece,
  cellSize,
  selected,
  clearing,
  boardTick,
  pulseTick,
  invalidTick,
  reducedMotion,
  onPress,
}: {
  index: number;
  piece: number;
  cellSize: number;
  selected: boolean;
  clearing: boolean;
  boardTick: number;
  pulseTick: number;
  invalidTick: number;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const wiggle = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!invalidTick || reducedMotion) return;
    wiggle.value = 0;
    wiggle.value = withSequence(
      withTiming(-7, { duration: 70 }),
      withTiming(7, { duration: 90 }),
      withTiming(-6, { duration: 90 }),
      withTiming(0, { duration: 70 }),
    );
  }, [invalidTick, reducedMotion, wiggle]);

  useEffect(() => {
    if (!pulseTick || reducedMotion) return;
    pulse.value = 0;
    pulse.value = withSequence(
      withSpring(1.14, { damping: 6, stiffness: 260 }),
      withSpring(1, { damping: 9, stiffness: 200 }),
    );
  }, [pulseTick, reducedMotion, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: clearing ? Math.max(0, 1 - pulse.value) : 1,
    transform: [
      { scale: clearing ? 1.15 - pulse.value : Math.max(pulse.value, selected ? 1.1 : 1) },
      { rotate: `${wiggle.value}deg` },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tessera riga ${rowOf(index) + 1} colonna ${(index % MATCH_COLS) + 1}${selected ? ', selezionata' : ''}`}
      onPress={onPress}
      style={[
        styles.cell,
        { width: cellSize, height: cellSize },
        selected && styles.cellSelected,
      ]}
    >
      {clearing && !reducedMotion ? <ClearBurst cellSize={cellSize} seed={index + 1} /> : null}
      <Animated.View
        key={`${boardTick}:${piece}`}
        entering={
          reducedMotion
            ? undefined
            : SlideInDown.duration(240).delay(rowOf(index) * 34)
        }
        style={style}
      >
        <MatchPiece type={piece} size={cellSize * 0.78} />
      </Animated.View>
    </Pressable>
  );
}

/** Sweep luminoso del razzo lungo riga o colonna. */
function RocketSweep({
  row,
  col,
  boardWidth,
  cellSize,
}: {
  row: number | null;
  col: number | null;
  boardWidth: number;
  cellSize: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [progress]);
  const horizontalStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -boardWidth + progress.value * boardWidth * 2 }],
    opacity: 1 - progress.value * 0.5,
  }));
  const verticalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -boardWidth + progress.value * boardWidth * 2 }],
    opacity: 1 - progress.value * 0.5,
  }));
  return (
    <>
      {row !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweep,
            { top: row * cellSize, height: cellSize, width: boardWidth * 0.6 },
            horizontalStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(20,184,166,0.5)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {col !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweep,
            { left: col * cellSize, width: cellSize, height: boardWidth * 0.6, top: -boardWidth * 0.3 },
            verticalStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(20,184,166,0.5)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </>
  );
}

/** Barra tempo che pulsa corallo sotto i 10 secondi. */
function TimeBarFill({ fraction, urgent }: { fraction: number; urgent: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!urgent) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 380, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 380, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [urgent, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: urgent ? pulse.value : 1 }));
  return (
    <Animated.View
      style={[
        styles.timeBarFill,
        { width: `${fraction * 100}%` },
        urgent && styles.timeBarFillUrgent,
        style,
      ]}
    />
  );
}

export default function MatchGameScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const { userId, usingMockGate } = useSession();
  const realEnabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [board, setBoard] = useState<Board>(() => randomBoard(Math.random));
  const [boardTick, setBoardTick] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [clearing, setClearing] = useState<ReadonlySet<number>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [commentary, setCommentary] = useState<{ id: number; text: string } | null>(null);
  const [expression, setExpression] = useState<BuddyExpression>('focused');
  const [scorePopup, setScorePopup] = useState<{ id: number; text: string; index: number | null } | null>(null);
  const [pulse, setPulse] = useState<{ a: number; b: number; tick: number } | null>(null);
  const [invalid, setInvalid] = useState<{ index: number; tick: number } | null>(null);
  const [rocket, setRocket] = useState<{ row: number | null; col: number | null; tick: number } | null>(null);
  const shake = useSharedValue(0);
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);
  const [shownScore, setShownScore] = useState(0);
  const [cellSize, setCellSize] = useState(48);

  const startedAt = useRef(0);
  const commentarySeq = useRef(0);
  const commentaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupSeq = useRef(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    void loadMatchBest(dog.id).then(setBest);
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

  const popup = (text: string, index: number | null = null) => {
    popupSeq.current += 1;
    setScorePopup({ id: popupSeq.current, text, index });
    const id = popupSeq.current;
    timeouts.current.push(
      setTimeout(
        () => setScorePopup((current) => (current?.id === id ? null : current)),
        900,
      ),
    );
  };

  const later = (ms: number, fn: () => void) => {
    timeouts.current.push(setTimeout(fn, ms));
  };

  const startGame = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    const fresh = randomBoard(Math.random);
    setBoard(fresh);
    setBoardTick((tick) => tick + 1);
    startedAt.current = Date.now();
    setSelected(null);
    setClearing(new Set());
    setResolving(false);
    setScore(0);
    setElapsed(0);
    setWeekRank(null);
    setShareDone(false);
    setPulse(null);
    setInvalid(null);
    setRocket(null);
    setPhase('playing');
    say(MATCH_START_LINE, 'focused');
  };

  const finish = () => {
    setPhase('done');
    setScore((finalScore) => {
      void saveMatchBest(finalScore, dog.id).then(setBest);
      if (realEnabled) {
        setSubmitting(true);
        void (async () => {
          try {
            await submitGameScore(dog.id, finalScore, 'match');
            const leaderboard = await fetchGameLeaderboard('match');
            setWeekRank(leaderboard.me?.rank ?? null);
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

  // Timer Blitz 60s.
  useEffect(() => {
    if (phase !== 'playing') return;
    let saidCountdown = false;
    const timer = setInterval(() => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);
      if (!saidCountdown && now >= MATCH_BLITZ_MS - 10_000 && now < MATCH_BLITZ_MS) {
        saidCountdown = true;
        say(MATCH_FINAL_SECONDS, 'focused');
      }
      if (now >= MATCH_BLITZ_MS) {
        clearInterval(timer);
        finish();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase, dog.id, realEnabled]);

  /** Risolve una catena alla volta con animazioni scaglionate. */
  const resolveChain = (chainIndex: number) => {
    const { cells, rockets } = findClears(boardRef.current);
    if (cells.size === 0) {
      setResolving(false);
      setClearing(new Set());
      if (!hasAnyMove(boardRef.current)) {
        setBoard(reshuffle(boardRef.current, Math.random));
        setBoardTick((tick) => tick + 1);
        say(MATCH_RESHUFFLE_LINE, 'focused');
      }
      return;
    }
    setResolving(true);
    setClearing(cells);
    const points = chainScore(cells.size, chainIndex);
    setScore((value) => value + points);
    const anchor = cells.size > 0 ? Math.min(...cells) : null;
    popup(`+${points}`, anchor);
    if (rockets > 0) {
      const first = anchor ?? 0;
      const isRow = rowOf(first) >= 0 && cells.has(indexOf(rowOf(first), (first + 1) % MATCH_COLS));
      setRocket({
        row: isRow ? rowOf(first) : null,
        col: isRow ? null : first % MATCH_COLS,
        tick: Date.now(),
      });
      if (!reducedMotion) {
        shake.value = 0;
        shake.value = withSequence(
          withTiming(-3, { duration: 40 }),
          withTiming(3, { duration: 40 }),
          withTiming(0, { duration: 40 }),
        );
      }
      say('RAZZO!', 'celebrate');
      timeouts.current.push(setTimeout(() => setRocket(null), 520));
    } else if (chainIndex >= 1) {
      say(
        MATCH_CHAIN_LINES[Math.min(chainIndex - 1, MATCH_CHAIN_LINES.length - 1)],
        'celebrate',
      );
    }
    later(reducedMotion ? 60 : 260, () => {
      setBoard((current) => removeDropRefill(current, cells, Math.random).board);
      setBoardTick((tick) => tick + 1);
      setClearing(new Set());
      later(reducedMotion ? 60 : 300, () => resolveChain(chainIndex + 1));
    });
  };

  const onCellPress = (index: number) => {
    if (phase !== 'playing' || resolving) return;
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    if (!isValidSwap(boardRef.current, selected, index)) {
      // swap non valido: wiggle e deseleziona
      setInvalid({ index: selected, tick: Date.now() });
      setSelected(null);
      return;
    }
    setPulse({ a: selected, b: index, tick: Date.now() });
    const next = swapCells(boardRef.current, selected, index);
    setSelected(null);
    setBoard(next);
    setBoardTick((tick) => tick + 1);
    later(reducedMotion ? 40 : 160, () => resolveChain(0));
  };

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

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const remainingSeconds = Math.max(0, Math.ceil((MATCH_BLITZ_MS - elapsed) / 1000));
  const timeFraction = 1 - Math.min(1, elapsed / MATCH_BLITZ_MS);

  const grid = useMemo(() => board.map((piece, index) => ({ piece, index })), [board]);

  return (
    <ScreenContainer scroll={phase !== 'playing'}>
      <StackScreenHeader title="Bau Match" />

      {phase === 'intro' ? (
        <View style={styles.introWrap}>
          <View style={styles.introArtRow}>
            {[0, 1, 2, 3, 4].map((piece) => (
              <MatchPiece key={piece} type={piece} size={46} />
            ))}
          </View>
          <Text style={styles.introTitle}>Scambia e scoppia!</Text>
          <Text style={styles.introText}>
            Tocca una tessera e una vicina per scambiarle.{'\n'}
            Tre in fila scoppiano; quattro fanno il razzo.{'\n'}
            Sessanta secondi, catene a moltiplicatore!
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
            <View style={styles.timeBarTrack} accessibilityLabel={`${remainingSeconds} secondi rimasti`}>
              <TimeBarFill fraction={timeFraction} urgent={remainingSeconds <= 10 && remainingSeconds > 0} />
            </View>
            <Text style={styles.hudTime}>{remainingSeconds}s</Text>
          </View>

          <Animated.View style={[styles.boardWrap, shakeStyle]}>
            <LinearGradient
              colors={['#DFF3EC', '#EAF7F1', '#FFF6E8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={styles.grid}
              onLayout={(event) =>
                setCellSize(Math.floor(event.nativeEvent.layout.width / MATCH_COLS))
              }
            >
              {grid.map(({ piece, index }) => (
                <Cell
                  key={index}
                  index={index}
                  piece={piece}
                  cellSize={cellSize}
                  selected={selected === index}
                  clearing={clearing.has(index)}
                  boardTick={boardTick}
                  pulseTick={pulse && (pulse.a === index || pulse.b === index) ? pulse.tick : 0}
                  invalidTick={invalid && invalid.index === index ? invalid.tick : 0}
                  reducedMotion={reducedMotion}
                  onPress={() => onCellPress(index)}
                />
              ))}
            </View>
            {rocket ? (
              <RocketSweep
                key={rocket.tick}
                row={rocket.row}
                col={rocket.col}
                boardWidth={cellSize * MATCH_COLS}
                cellSize={cellSize}
              />
            ) : null}
            {scorePopup ? (
              <Animated.View
                key={scorePopup.id}
                entering={FadeIn.duration(160)}
                style={[
                  styles.scorePopup,
                  scorePopup.index !== null && {
                    position: 'absolute',
                    top: rowOf(scorePopup.index) * cellSize,
                    left: (scorePopup.index % MATCH_COLS) * cellSize - spacing.sm,
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.scorePopupText}>{scorePopup.text}</Text>
              </Animated.View>
            ) : null}
          </Animated.View>
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
          <AvatarActor size={88} expression={score > 40 ? 'celebrate' : 'sad'} photoUri={dog.photoUri} dogName={dog.name} />
          <View style={styles.doneBubble}>
            <Text style={styles.doneLine}>{matchEndgameLine(score)}</Text>
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
                  gameLabel: 'Bau Match',
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
  introArtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
  hud: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hudScore: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hudScoreText: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  timeBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  timeBarFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  timeBarFillUrgent: { backgroundColor: colors.danger },
  sweep: { position: 'absolute' },
  hudTime: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    minWidth: 30,
    textAlign: 'right',
  },
  boardWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.sm,
    ...shadows.card,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cellSelected: {
    backgroundColor: 'rgba(20, 184, 166, 0.16)',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  scorePopup: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadows.raised,
  },
  scorePopupText: {
    color: colors.accent,
    fontSize: typography.size.xl,
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

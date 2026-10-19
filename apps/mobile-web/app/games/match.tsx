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
  MATCH_CHAIN_LINES,
  MATCH_LIVES,
  MATCH_COLS,
  MATCH_RESHUFFLE_LINE,
  MATCH_ROWS,
  MATCH_START_LINE,
  chainScore,
  findClears,
  hasAnyMove,
  indexOf,
  isMatchGameOver,
  isValidSwap,
  loadMatchBest,
  livesAfterMistake,
  matchLevelGoal,
  matchPieceCountForLevel,
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
import { hapticSelection, hapticSuccess } from '@/lib/haptics';
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
function MatchLives({ lives }: { lives: number }) {
  return (
    <View style={styles.matchLives} accessibilityLabel={`${lives} vite rimaste`}>
      {[0, 1, 2].map((index) => (
        <CuteIcon
          key={`${index}-${lives > index}`}
          name="heart"
          size={18}
          color={lives > index ? '#FF8B74' : colors.surfaceMuted}
          secondary={lives > index ? '#FF8B74' : colors.surfaceMuted}
        />
      ))}
    </View>
  );
}

function LevelUpBanner({ level }: { level: number }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.levelUpBanner} pointerEvents="none">
      <CuteIcon name="paw" size={18} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
      <Text style={styles.levelUpText}>Livello {level}!</Text>
    </Animated.View>
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
  const [level, setLevel] = useState(1);
  const [levelProgress, setLevelProgress] = useState(0);
  const [lives, setLives] = useState(MATCH_LIVES);
  const [levelUpTick, setLevelUpTick] = useState(0);
  const [doneReason, setDoneReason] = useState<'lives' | 'complete'>('lives');
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

  const levelRef = useRef(1);
  const levelProgressRef = useRef(0);
  const levelUpPending = useRef(false);
  const livesRef = useRef(MATCH_LIVES);
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
    const fresh = randomBoard(Math.random, matchPieceCountForLevel(1));
    setBoard(fresh);
    setBoardTick((tick) => tick + 1);
    setSelected(null);
    setClearing(new Set());
    setResolving(false);
    setScore(0);
    levelRef.current = 1;
    levelProgressRef.current = 0;
    levelUpPending.current = false;
    livesRef.current = MATCH_LIVES;
    setLevel(1);
    setLevelProgress(0);
    setLives(MATCH_LIVES);
    setLevelUpTick(0);
    setDoneReason('lives');
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
      void saveMatchBest(finalScore, dog.id).then((nextBest) => {
        setBest(nextBest);
        if (finalScore > 0 && nextBest === finalScore) void hapticSuccess();
      });
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

  const advanceLevel = () => {
    const nextLevel = levelRef.current + 1;
    levelRef.current = nextLevel;
    levelProgressRef.current = 0;
    levelUpPending.current = false;
    setLevel(nextLevel);
    setLevelProgress(0);
    setLevelUpTick(Date.now());
    setSelected(null);
    setClearing(new Set());
    setResolving(false);
    setBoard(randomBoard(Math.random, matchPieceCountForLevel(nextLevel)));
    setBoardTick((tick) => tick + 1);
    void hapticSuccess();
    say(
      nextLevel >= 3
        ? `Livello ${nextLevel}! Ora serve più precisione.`
        : `Livello ${nextLevel}! Le zampine prendono ritmo.`,
      'celebrate',
    );
  };

  /** Risolve una catena alla volta con animazioni scaglionate. */
  const resolveChain = (chainIndex: number) => {
    const { cells, rockets } = findClears(boardRef.current);
    if (cells.size === 0) {
      setResolving(false);
      setClearing(new Set());
      if (levelUpPending.current) {
        advanceLevel();
        return;
      }
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
    const goal = matchLevelGoal(levelRef.current);
    const nextProgress = levelProgressRef.current + points;
    levelProgressRef.current = nextProgress;
    setLevelProgress(Math.min(nextProgress, goal));
    if (nextProgress >= goal) levelUpPending.current = true;
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
      setBoard((current) =>
        removeDropRefill(current, cells, Math.random, matchPieceCountForLevel(levelRef.current)).board,
      );
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
      const nextLives = livesAfterMistake(livesRef.current);
      livesRef.current = nextLives;
      setLives(nextLives);
      say(nextLives > 0 ? `Occhio: ti resta${nextLives === 1 ? '' : 'no'} ${nextLives} vit${nextLives === 1 ? 'a' : 'e'}.` : 'Le vite sono finite.', 'sad');
      if (isMatchGameOver(nextLives)) {
        setDoneReason('lives');
        later(reducedMotion ? 60 : 320, finish);
      }
      return;
    }
    void hapticSelection();
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

  const levelGoal = matchLevelGoal(level);
  const levelFraction = Math.min(1, levelProgress / levelGoal);

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
            Supera i livelli: hai tre vite e nessun cronometro.
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
            <View style={styles.levelHud} accessibilityLabel={`Livello ${level}, ${levelProgress} di ${levelGoal} punti`}>
              <Text style={styles.levelLabel}>LIVELLO {level}</Text>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${levelFraction * 100}%` }]} />
              </View>
            </View>
            <MatchLives lives={lives} />
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
            {levelUpTick ? <LevelUpBanner key={levelUpTick} level={level} /> : null}
          </Animated.View>
        </View>
      ) : null}

      {phase === 'done' ? (
        <View style={styles.doneWrap}>
          <Text style={styles.doneLabel}>Punteggio</Text>
          <Text style={styles.doneLevel}>Livello raggiunto: {level}</Text>
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
          {doneReason === 'lives' ? (
            <Text style={styles.doneBestPlain}>Le vite sono finite. Riprova con calma: non c’è nessun tempo da battere.</Text>
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
              Il tuo record personale resta qui.
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
  levelHud: {
    flex: 1,
    gap: 3,
    minWidth: 92,
  },
  levelLabel: { color: colors.primary, fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 0.6 },
  levelTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  levelFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  matchLives: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  levelUpBanner: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadows.raised,
  },
  levelUpText: { color: colors.textOnPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
  sweep: { position: 'absolute' },
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
  doneLevel: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
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

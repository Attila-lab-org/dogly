/**
 * "Fiuto da campione" — memory delle ciotole: un bocconcino viene coperto,
 * shuffle animato a coppie, il giocatore sceglie. 10 round, streak 3+ con
 * bonus, aiutino "Naso di Oreo" (1 per partita). Oreo telecronista.
 * Logica pura in features/games/sniffLogic.ts (shuffle tracciabile,
 * posizione finale sempre corretta — testata).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { DogIllustration } from '@/components/DogIllustration';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { DogAvatar } from '@/features/core/components';
import {
  SNIFF_CORRECT_LINES,
  SNIFF_HINT_LINE,
  SNIFF_ROUNDS,
  SNIFF_START_LINE,
  SNIFF_WRONG_LINES,
  buildSniffRound,
  loadSniffBest,
  saveSniffBest,
  sniffEndgameLine,
  sniffRoundPoints,
  type SniffRound,
} from '@/features/games/sniffLogic';
import { fetchGameLeaderboard, submitGameScore } from '@/features/games/api';
import { shareSquirrelResult } from '@/features/games/shareScoreCard';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { isPersistedId } from '@/lib/persistedId';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

type Phase = 'intro' | 'playing' | 'done';
type RoundStage = 'show' | 'cover' | 'shuffle' | 'pick' | 'reveal';

const BOWL_TONES = [
  { bg: colors.accentSoft, fg: colors.accentPressed },
  { bg: colors.warningSoft, fg: '#B45309' },
  { bg: colors.primarySoft, fg: colors.primary },
] as const;

function TreatBone() {
  return (
    <Svg width={34} height={22} viewBox="0 0 34 22">
      <Path
        d="M7 3 C4 0 0 3 2 7 C0 10 4 13 7 10 L25 10 C28 13 32 10 30 7 C32 3 28 0 25 3 Z"
        fill="#FFF9F0"
        stroke={colors.text}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Ciotola animata: si sposta tra gli slot durante lo shuffle. */
function Bowl({
  slot,
  lift,
  wiggle,
  tone,
}: {
  slot: SharedValue<number>;
  lift: SharedValue<number>;
  wiggle: SharedValue<number>;
  tone: (typeof BOWL_TONES)[number];
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: slot.value },
      { translateY: -lift.value },
      { rotate: `${wiggle.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[styles.bowl, style]}>
      <View style={[styles.bowlBody, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
        <CuteIcon name="bowl" size={44} color={tone.fg} secondary={colors.text} />
      </View>
    </Animated.View>
  );
}

/** Oreo telecronista (stesso pattern di Scoiattolo!). */
function Commentator({
  photoUri,
  dogName,
  line,
}: {
  photoUri: string | null;
  dogName: string;
  line: { id: number; text: string } | null;
}) {
  return (
    <View style={styles.commentator} pointerEvents="none">
      <View style={styles.commentatorAvatar}>
        {photoUri ? (
          <DogAvatar size={40} photoUri={photoUri} dogName={dogName} />
        ) : (
          <DogIllustration size={46} mood="welcome" />
        )}
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

const SLOT_COUNT = 3;

export default function SniffGameScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const { userId, usingMockGate } = useSession();
  const realEnabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dog.id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [stage, setStage] = useState<RoundStage>('show');
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [commentary, setCommentary] = useState<{ id: number; text: string } | null>(null);
  const [weekRank, setWeekRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);
  const [shownScore, setShownScore] = useState(0);

  const current = useRef<SniffRound | null>(null);
  const streak = useRef(0);
  const commentarySeq = useRef(0);
  const commentaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fieldWidth = useRef(360);

  const slot0 = useSharedValue(0);
  const slot1 = useSharedValue(0);
  const slot2 = useSharedValue(0);
  const slotValues = [slot0, slot1, slot2];
  const lift0 = useSharedValue(0);
  const lift1 = useSharedValue(0);
  const lift2 = useSharedValue(0);
  const liftValues = [lift0, lift1, lift2];
  const wiggle0 = useSharedValue(0);
  const wiggle1 = useSharedValue(0);
  const wiggle2 = useSharedValue(0);
  const wiggleValues = [wiggle0, wiggle1, wiggle2];

  useEffect(() => {
    void loadSniffBest(dog.id).then(setBest);
    return () => {
      timeouts.current.forEach(clearTimeout);
      if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    };
  }, [dog.id]);

  const say = (text: string) => {
    commentarySeq.current += 1;
    setCommentary({ id: commentarySeq.current, text });
    if (commentaryTimer.current) clearTimeout(commentaryTimer.current);
    commentaryTimer.current = setTimeout(() => setCommentary(null), 1800);
  };

  const slotWidth = () => fieldWidth.current / SLOT_COUNT;

  const later = (ms: number, fn: () => void) => {
    timeouts.current.push(setTimeout(fn, ms));
  };

  const startGame = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    streak.current = 0;
    setScore(0);
    setWeekRank(null);
    setShareDone(false);
    setHintUsed(false);
    hintActiveRef.current = false;
    setPickedSlot(null);
    setPhase('playing');
    say(SNIFF_START_LINE);
    startRound(1);
  };

  const startRound = (round: number) => {
    const plan = buildSniffRound(round, Math.random);
    current.current = plan;
    setRoundNumber(round);
    setStage('show');
    setPickedSlot(null);
    // Posizioni iniziali ordinate.
    slotValues.forEach((value, index) => {
      value.value = index * slotWidth();
    });
    liftValues.forEach((value) => {
      value.value = 0;
    });
    // Il bocconcino appare, la ciotola giusta lo copre, poi shuffle.
    later(900, () => setStage('cover'));
    let t = 900 + 450;
    later(t, () => setStage('shuffle'));
    t += 250;
    for (const move of plan.moves) {
      later(t, () => {
        const width = slotWidth();
        const aX = slotValues[move.a].value;
        const bX = slotValues[move.b].value;
        const duration = reducedMotion ? 0 : move.durationMs;
        slotValues[move.a].value = withTiming(bX, { duration, easing: Easing.inOut(Easing.cubic) });
        slotValues[move.b].value = withTiming(aX, { duration, easing: Easing.inOut(Easing.cubic) });
      });
      t += reducedMotion ? 60 : move.durationMs + 60;
    }
    later(t, () => {
      setStage('pick');
      if (hintActiveRef.current) {
        wiggleSlot(current.current?.treatFinalSlot ?? -1);
      }
    });
  };

  const hintActiveRef = useRef(false);

  const wiggleSlot = (slotIndex: number) => {
    if (reducedMotion || slotIndex < 0) return;
    wiggleValues[slotIndex].value = withSequence(
      withTiming(-6, { duration: 90 }),
      withTiming(6, { duration: 110 }),
      withTiming(-6, { duration: 110 }),
      withTiming(0, { duration: 90 }),
    );
  };

  const useHint = () => {
    if (hintUsed || stage === 'reveal') return;
    hintActiveRef.current = true;
    setHintUsed(true);
    say(SNIFF_HINT_LINE);
    if (stage === 'pick') {
      wiggleSlot(current.current?.treatFinalSlot ?? -1);
    }
  };

  const pickBowl = (slotIndex: number) => {
    if (stage !== 'pick' || pickedSlot !== null) return;
    const plan = current.current;
    if (!plan) return;
    setPickedSlot(slotIndex);
    setStage('reveal');
    const correct = slotIndex === plan.treatFinalSlot;
    if (!reducedMotion) {
      liftValues[slotIndex].value = withSpring(46, { damping: 9, stiffness: 220 });
    } else {
      liftValues[slotIndex].value = 46;
    }
    if (correct) {
      streak.current += 1;
      const points = sniffRoundPoints(true, streak.current);
      setScore((value) => value + points);
      say(SNIFF_CORRECT_LINES[Math.floor(Math.random() * SNIFF_CORRECT_LINES.length)]);
    } else {
      streak.current = 0;
      // Solleva anche la ciotola giusta: impara dove era.
      if (!reducedMotion) {
        liftValues[plan.treatFinalSlot].value = withTiming(30, { duration: 260 });
      } else {
        liftValues[plan.treatFinalSlot].value = 30;
      }
      say(SNIFF_WRONG_LINES[Math.floor(Math.random() * SNIFF_WRONG_LINES.length)]);
    }
    later(1100, () => {
      if (roundNumber >= SNIFF_ROUNDS) {
        finish();
      } else {
        startRound(roundNumber + 1);
      }
    });
  };

  const finish = () => {
    setPhase('done');
    setScore((finalScore) => {
      void saveSniffBest(finalScore, dog.id).then(setBest);
      if (realEnabled) {
        setSubmitting(true);
        void (async () => {
          try {
            await submitGameScore(dog.id, finalScore, 'sniff');
            const board = await fetchGameLeaderboard('sniff');
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

  const treatSlot =
    stage === 'show' || stage === 'cover'
      ? (current.current?.treatStartSlot ?? 1)
      : stage === 'reveal' && pickedSlot !== null
        ? (current.current?.treatFinalSlot ?? -1)
        : -1;
  const treatVisible =
    (stage === 'show' || (stage === 'reveal' && pickedSlot === current.current?.treatFinalSlot)) &&
    treatSlot >= 0;

  return (
    <ScreenContainer scroll={phase !== 'playing'}>
      <StackScreenHeader title="Fiuto da campione" />

      {phase === 'intro' ? (
        <View style={styles.introWrap}>
          <View style={styles.introArtRow}>
            {BOWL_TONES.map((tone, index) => (
              <View key={index} style={[styles.bowlBody, styles.introBowl, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
                <CuteIcon name="bowl" size={44} color={tone.fg} secondary={colors.text} />
              </View>
            ))}
          </View>
          <Text style={styles.introTitle}>Dov'è il bocconcino?</Text>
          <Text style={styles.introText}>
            Guarda dove lo nascondo, segui le ciotole{'\n'}
            mentre si scambiano e scegli quella giusta.{'\n'}
            Dieci round; tre di fila e c'è il bonus.
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
          <Commentator photoUri={dog.photoUri} dogName={dog.name} line={commentary} />
          <View style={styles.hud}>
            <View style={styles.hudScore} accessibilityLabel={`Punteggio ${score}`}>
              <CuteIcon name="paw" size={16} color={colors.accent} secondary={colors.accent} />
              <Text style={styles.hudScoreText}>{score}</Text>
            </View>
            <Text style={styles.hudTime}>
              Round {roundNumber}/{SNIFF_ROUNDS}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                hintUsed ? 'Aiutino del naso già usato' : 'Usa il naso di Oreo: la ciotola giusta si muove'
              }
              disabled={hintUsed}
              onPress={useHint}
              style={({ pressed }) => [
                styles.hintButton,
                (pressed || hintUsed) && styles.pressed,
                hintUsed && styles.hintButtonUsed,
              ]}
            >
              <CuteIcon name="search" size={14} color={hintUsed ? colors.textMuted : colors.primary} secondary={hintUsed ? colors.textMuted : colors.primary} />
              <Text style={[styles.hintText, hintUsed && styles.hintTextUsed]}>
                Naso di Oreo
              </Text>
            </Pressable>
          </View>

          <View
            style={styles.field}
            onLayout={(event) => {
              fieldWidth.current = event.nativeEvent.layout.width;
              if (stage === 'show' && roundNumber > 0) {
                slotValues.forEach((value, index) => {
                  value.value = index * slotWidth();
                });
              }
            }}
          >
            <LinearGradient
              colors={['#D9ECFB', '#E7F5EE', '#DFF3EC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.tableLine} pointerEvents="none" />

            {treatVisible ? (
              <View
                pointerEvents="none"
                style={[styles.treat, { left: treatSlot * slotWidth() + slotWidth() / 2 - 17 }]}
              >
                <TreatBone />
              </View>
            ) : null}

            {BOWL_TONES.map((tone, index) => (
              <Bowl
                key={`bowl-${index}`}
                slot={slotValues[index]}
                lift={liftValues[index]}
                wiggle={wiggleValues[index]}
                tone={tone}
              />
            ))}
            {BOWL_TONES.map((_, index) => (
              <Pressable
                key={`slot-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Ciotola ${index + 1}${
                  stage === 'pick' ? ': scegli questa' : ''
                }`}
                disabled={stage !== 'pick'}
                onPress={() => pickBowl(index)}
                style={[styles.bowlHit, { left: `${(index * 100) / SLOT_COUNT}%` }]}
              />
            ))}
          </View>

          <Text style={styles.stageHint}>
            {stage === 'pick'
              ? 'Tocca la ciotola col bocconcino!'
              : stage === 'shuffle'
                ? 'Segui le ciotole…'
                : stage === 'reveal'
                  ? ''
                  : 'Guarda dove finisce il bocconcino…'}
          </Text>
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
          <View style={styles.doneBubble}>
            <Text style={styles.doneLine}>{sniffEndgameLine(score)}</Text>
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
                  gameLabel: 'Fiuto da campione',
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
  introArtRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  introBowl: { width: 74, height: 62 },
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
  hudTime: { flex: 1, color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hintButtonUsed: { borderColor: colors.border },
  hintText: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  hintTextUsed: { color: colors.textMuted },
  field: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  tableLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 30,
    height: 4,
    backgroundColor: '#74C4A9',
  },
  bowlHit: {
    position: 'absolute',
    bottom: 20,
    width: '33.33%',
    height: 130,
  },
  bowl: {
    position: 'absolute',
    bottom: 0,
    width: '33.33%',
    alignItems: 'center',
  },
  bowlBody: {
    width: 84,
    height: 66,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  treat: { position: 'absolute', bottom: 40 },
  stageHint: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
    minHeight: 20,
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

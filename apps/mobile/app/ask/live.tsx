/**
 * DOGly Live — dedicated voice room (UX_REFERENCE Ask Live).
 * Atmospheric presence + minute ring; WebRTC via ephemeral OpenAI secret.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  connectLiveWebRtc,
  type LiveConnectionState,
  type LiveWebRtcHandle,
} from '@/features/realtime/liveWebRtc';
import { createLiveSession, endLiveSession } from '@/features/realtime/liveApi';

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AskLiveScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<'gate' | 'live' | 'ending'>('gate');
  const [conn, setConn] = useState<LiveConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(240);
  const [welcome, setWelcome] = useState('');
  const [voiceLabel, setVoiceLabel] = useState('');
  const sessionIdRef = useRef<string | null>(null);
  const handleRef = useRef<LiveWebRtcHandle | null>(null);
  const startingRef = useRef(false);
  const level = useSharedValue(0);
  const breath = useSharedValue(1);
  const ringWarn = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    breath.value = withRepeat(
      withTiming(1.045, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reducedMotion, breath]);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => {
      const mic = handleRef.current?.getAnalyserLevel() ?? 0;
      level.value = withTiming(mic, { duration: 80 });
      setSecondsLeft((current) => {
        if (current <= 1) {
          void finish('I minuti di oggi sono finiti.');
          return 0;
        }
        if (current === 30) ringWarn.value = withTiming(1, { duration: 600 });
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, level, ringWarn]);

  const finish = useCallback(
    async (note?: string) => {
      if (phase === 'ending') return;
      setPhase('ending');
      handleRef.current?.stop();
      handleRef.current = null;
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      if (id) {
        try {
          await endLiveSession(id);
        } catch {
          /* best effort */
        }
      }
      router.replace({
        pathname: '/ask',
        params: note ? { liveNote: note } : undefined,
      } as never);
    },
    [phase, router],
  );

  const startLive = useCallback(async () => {
    if (startingRef.current || handleRef.current) return;
    startingRef.current = true;
    setError(null);
    setConn('connecting');
    try {
      const session = await createLiveSession(dog.id);
      sessionIdRef.current = session.session_id;
      setSecondsLeft(session.seconds_remaining);
      setWelcome(session.welcome_text);
      setVoiceLabel(
        session.voice_gender === 'MALE' ? 'Voce calda' : 'Voce luminosa',
      );
      setPhase('live');
      if (Platform.OS !== 'web') {
        setError(
          'Live vocale completo è ottimizzato sul web. Apri dogly.app dal browser per la conversazione.',
        );
        setConn('error');
        startingRef.current = false;
        return;
      }
      // Tear down any leftover peer before opening a new one (Strict Mode / retry).
      const leftover = handleRef.current as LiveWebRtcHandle | null;
      leftover?.stop();
      const handle = await connectLiveWebRtc({
        clientSecret: session.client_secret,
        onState: setConn,
        onError: (message) => setError(message),
      });
      handleRef.current = handle;
    } catch (err) {
      setConn('error');
      setPhase('gate');
      setError(
        err instanceof Error
          ? err.message
          : 'Non riesco ad aprire Live. Riprova tra poco.',
      );
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      if (id) void endLiveSession(id).catch(() => undefined);
    } finally {
      startingRef.current = false;
    }
  }, [dog.id]);

  useEffect(
    () => () => {
      handleRef.current?.stop();
      const id = sessionIdRef.current;
      if (id) void endLiveSession(id).catch(() => undefined);
    },
    [],
  );

  const haloStyle = useAnimatedStyle(() => {
    const pulse = 1 + level.value * 0.18;
    return {
      transform: [{ scale: breath.value * pulse }],
      opacity: 0.35 + level.value * 0.45 + (1 - ringWarn.value) * 0.05,
    };
  });
  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.28 }],
    opacity: 0.18 + level.value * 0.35,
    borderColor: ringWarn.value > 0.5 ? colors.warning : colors.primary,
  }));
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const statusCopy =
    conn === 'connecting'
      ? 'Sto entrando…'
      : conn === 'speaking'
        ? 'DOGly parla'
        : conn === 'listening'
          ? 'Ti ascolto'
          : conn === 'error'
            ? 'Connessione interrotta'
            : 'Pronta';

  return (
    <LinearGradient colors={['#E8F4FF', '#F4F7FB', '#FFFFFF']} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => void finish()}
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.timerWrap}>
            <Animated.View
              style={[
                styles.timerRing,
                secondsLeft <= 30 && styles.timerRingWarn,
              ]}
            />
            <Text
              style={[styles.timer, secondsLeft <= 30 && styles.timerWarn]}
              accessibilityLabel={`Minuti rimasti ${formatClock(secondsLeft)}`}
            >
              {formatClock(secondsLeft)}
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {phase === 'gate' ? (
          <Animated.View entering={FadeInUp.duration(500)} style={styles.gate}>
            <View style={styles.gateAvatar}>
              <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={112} />
            </View>
            <Text style={styles.gateEyebrow}>PARLA CON DOGLY</Text>
            <Text style={styles.gateTitle}>Una stanza solo per {dog.name}</Text>
            <Text style={styles.gateBody}>
              Hai {formatClock(secondsLeft)}. Si consumano solo mentre parli.
              Scegli la voce in Profilo.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inizia conversazione vocale"
              onPress={() => void startLive()}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <Ionicons name="mic" size={20} color="#FFFFFF" />
              <Text style={styles.ctaText}>Inizia</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.secondary}>
              <Text style={styles.secondaryText}>Torna al testo</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={styles.stage}>
            <Text style={styles.status}>{statusCopy}</Text>
            {voiceLabel ? <Text style={styles.voiceHint}>{voiceLabel}</Text> : null}
            <View style={styles.presence}>
              <Animated.View style={[styles.outerRing, outerRingStyle]} />
              <Animated.View style={[styles.halo, haloStyle]} />
              <Animated.View style={avatarStyle}>
                <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={128} />
              </Animated.View>
            </View>
            {welcome ? <Text style={styles.welcome}>{welcome}</Text> : null}
            {conn === 'connecting' ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {secondsLeft <= 30 && secondsLeft > 0 ? (
              <Text style={styles.warnNote}>Quasi finiti</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Termina conversazione"
              onPress={() => void finish('Conversazione vocale terminata.')}
              style={({ pressed }) => [styles.endBtn, pressed && styles.pressed]}
            >
              <Text style={styles.endText}>Termina</Text>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timerWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 88 },
  timerRing: {
    position: 'absolute',
    width: 72,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(37,99,235,0.28)',
  },
  timerRingWarn: { borderColor: 'rgba(245,158,11,0.55)' },
  timer: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  timerWarn: { color: colors.warning },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  gateAvatar: {
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  gateEyebrow: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1,
  },
  gateTitle: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  gateBody: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.md,
  },
  cta: {
    marginTop: spacing.md,
    minHeight: 54,
    minWidth: 200,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  secondary: { marginTop: spacing.md, padding: spacing.sm },
  secondaryText: {
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  status: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  voiceHint: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    marginBottom: spacing.xl,
  },
  presence: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  halo: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(37,99,235,0.16)',
  },
  welcome: {
    marginTop: spacing.xl,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  warnNote: {
    marginTop: spacing.md,
    color: colors.warning,
    fontWeight: typography.weight.bold,
  },
  endBtn: {
    marginTop: spacing.xxl,
    minHeight: 52,
    minWidth: 160,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  endText: {
    color: colors.text,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    textAlign: 'center',
    fontSize: typography.size.sm,
    maxWidth: 320,
  },
  pressed: { opacity: 0.88 },
});

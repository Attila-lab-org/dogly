import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { deleteAsync } from 'expo-file-system/legacy';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components';
import { useDogProfile } from '../../src/features/core/useDogProfile';
import { SIGNAL_AUDIO_ASSETS } from '../../src/features/signals/audioAssets';
import {
  metaForCategory,
  SIGNAL_REACTIONS,
  signalResultSummary,
} from '../../src/features/signals/copy';
import {
  nextSignalExperiment,
  recordSignalExperiment,
} from '../../src/features/signals/store';
import {
  phaseProgress,
  SIGNAL_BASELINE_MS,
  SIGNAL_OBSERVATION_MS,
  SIGNAL_PLAYBACK_MS,
  SIGNAL_TOTAL_SECONDS,
  type SignalCapturePhase,
} from '../../src/features/signals/sequence';
import type {
  SignalFeedback,
  SignalObservedBehavior,
} from '../../src/features/signals/types';
import { colors, radius, shadows, spacing, typography } from '../../src/theme';

const ACTIVE_PHASES: SignalCapturePhase[] = ['baseline', 'playing', 'observing'];

export default function SignalExperimentScreen() {
  const { dog } = useDogProfile();
  const experiment = useMemo(() => nextSignalExperiment(dog.id), [dog.id]);
  const meta = metaForCategory(experiment.category);
  const player = useAudioPlayer(SIGNAL_AUDIO_ASSETS[experiment.category]);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const recordingRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalStartedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<SignalCapturePhase>('intro');
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [selected, setSelected] = useState<SignalObservedBehavior[]>([]);
  const [reactionLatencyMs, setReactionLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const removeRecording = async () => {
    try {
      const recording = await recordingRef.current;
      if (recording?.uri) await deleteAsync(recording.uri, { idempotent: true });
    } catch {
      // The cache may already have been cleared by the OS.
    } finally {
      recordingRef.current = null;
    }
  };

  const stopCapture = async () => {
    clearTimers();
    player.pause();
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // No active recording.
    }
    await removeRecording();
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void stopCapture();
    };
    // Native player and refs are stable for this screen lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = async (message: string) => {
    await stopCapture();
    if (!mountedRef.current) return;
    setErrorMessage(message);
    setPhase('error');
  };

  const finishObservation = async () => {
    clearTimers();
    player.pause();
    try {
      cameraRef.current?.stopRecording();
      await removeRecording();
      if (mountedRef.current) setPhase('annotating');
    } catch {
      await fail('Non sono riuscito a chiudere la registrazione. Riprova.');
    }
  };

  const playSignal = async () => {
    if (!mountedRef.current) return;
    setPhase('playing');
    signalStartedAtRef.current = Date.now();
    try {
      player.volume = 0.4;
      await player.seekTo(0);
      player.play();
    } catch {
      await fail('Il segnale audio non è partito. Riprova senza salvare questo tentativo.');
      return;
    }
    timersRef.current.push(setTimeout(() => {
      player.pause();
      if (!mountedRef.current) return;
      setPhase('observing');
      timersRef.current.push(setTimeout(() => void finishObservation(), SIGNAL_OBSERVATION_MS));
    }, SIGNAL_PLAYBACK_MS));
  };

  const startExperiment = async () => {
    setErrorMessage(null);
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert(
          'Fotocamera necessaria',
          'Apri le impostazioni del telefono e consenti a Dogly di usare la fotocamera.',
        );
      }
      return;
    }
    if (!cameraReady || !cameraRef.current) {
      Alert.alert('Fotocamera non pronta', 'Attendi un istante e riprova.');
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      setReactionLatencyMs(null);
      setSelected([]);
      setCountdown(3);
      setPhase('baseline');
      const recording = cameraRef.current.recordAsync({
        maxDuration: SIGNAL_TOTAL_SECONDS,
      });
      recordingRef.current = recording;
      void recording.catch(async () => {
        recordingRef.current = null;
        await fail('La registrazione si è interrotta. Questo tentativo non verrà salvato.');
      });
      intervalRef.current = setInterval(() => {
        setCountdown((value) => Math.max(1, value - 1));
      }, 1_000);
      timersRef.current.push(setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        void playSignal();
      }, SIGNAL_BASELINE_MS));
    } catch {
      await fail('Non sono riuscito ad avviare fotocamera e audio insieme.');
    }
  };

  const markReaction = () => {
    if (reactionLatencyMs !== null || signalStartedAtRef.current === null) return;
    setReactionLatencyMs(Date.now() - signalStartedAtRef.current);
  };

  const toggleBehavior = (behavior: SignalObservedBehavior) => {
    if (behavior === 'NO_VISIBLE_RESPONSE') {
      setSelected(['NO_VISIBLE_RESPONSE']);
      return;
    }
    setSelected((current) => {
      const withoutNone = current.filter((item) => item !== 'NO_VISIBLE_RESPONSE');
      return withoutNone.includes(behavior)
        ? withoutNone.filter((item) => item !== behavior)
        : [...withoutNone, behavior];
    });
  };

  const save = async (feedback: SignalFeedback) => {
    try {
      await recordSignalExperiment(
        dog.id,
        dog.name,
        experiment.category,
        selected,
        reactionLatencyMs,
        feedback,
      );
      setPhase('saved');
    } catch {
      setErrorMessage('Il tentativo non è stato salvato. Controlla la connessione e riprova.');
      setPhase('error');
    }
  };

  const isActive = ACTIVE_PHASES.includes(phase);
  const summary = signalResultSummary(dog.name, selected);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi esperimento"
          onPress={() => {
            void stopCapture().finally(() => router.back());
          }}
          style={styles.iconButton}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${phaseProgress(phase) * 100}%` }]} />
        </View>
        <View style={styles.stepBadge}>
          <Text variant="caption">{isActive ? 'LIVE' : 'SIGNALS'}</Text>
        </View>
      </View>

      {(phase === 'intro' || isActive) && (
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              active
              facing="back"
              mode="video"
              mute
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => setCameraReady(false)}
              style={styles.camera}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="videocam-outline" size={34} color={colors.primary} />
              <Text variant="caption" color={colors.textSecondary}>La camera si attiva con il tuo consenso</Text>
            </View>
          )}
          {isActive && (
            <View style={styles.liveOverlay}>
              <View style={styles.liveDot} />
              <Text variant="caption" color={colors.surface}>Camera attiva</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.content}>
        {phase === 'intro' && (
          <>
            <Text variant="eyebrow">{meta.title}</Text>
            <Text variant="title">Osserviamo come risponde {dog.name}</Text>
            <Text variant="body" color={colors.textSecondary}>
              Inquadralo per intero. Dopo 3 secondi il telefono riprodurrà automaticamente
              un segnale breve, una sola volta.
            </Text>
            <View style={styles.infoCard}>
              <Info icon="volume-medium-outline" text="Volume moderato, impostato da Dogly" />
              <Info icon="hand-left-outline" text="Tocca “Ha reagito” appena noti un cambiamento" />
              <Info icon="trash-outline" text="Il breve video non viene conservato" />
            </View>
            <AppButton
              label={cameraReady ? 'Inizia esperimento' : 'Attiva fotocamera'}
              onPress={() => void startExperiment()}
              fullWidth
            />
          </>
        )}

        {phase === 'baseline' && (
          <>
            <Text variant="eyebrow">Prima del segnale</Text>
            <Text variant="display">{countdown}</Text>
            <Text variant="body" color={colors.textSecondary}>
              Tieni fermo il telefono. Il suono partirà automaticamente.
            </Text>
          </>
        )}

        {(phase === 'playing' || phase === 'observing') && (
          <>
            <Text variant="eyebrow">{phase === 'playing' ? 'Segnale in riproduzione' : 'Dopo il segnale'}</Text>
            <Text variant="title">
              {reactionLatencyMs === null ? `Guarda ${dog.name}` : 'Reazione segnalata'}
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {reactionLatencyMs === null
                ? 'Tocca appena noti un movimento o un cambio di attenzione.'
                : `Tempo di risposta: ${(reactionLatencyMs / 1000).toFixed(1).replace('.', ',')} s`}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={reactionLatencyMs !== null}
              onPress={markReaction}
              style={[styles.reactionButton, reactionLatencyMs !== null && styles.reactionButtonDone]}
            >
              <Ionicons
                name={reactionLatencyMs === null ? 'paw-outline' : 'checkmark'}
                size={28}
                color={colors.surface}
              />
              <Text variant="button" color={colors.surface}>
                {reactionLatencyMs === null ? 'Ha reagito' : 'Registrato'}
              </Text>
            </Pressable>
          </>
        )}

        {phase === 'annotating' && (
          <>
            <Text variant="eyebrow">La tua osservazione</Text>
            <Text variant="title">Cosa hai notato?</Text>
            <Text variant="body" color={colors.textSecondary}>
              Seleziona solo comportamenti chiaramente visibili.
            </Text>
            <View style={styles.reactionList}>
              {SIGNAL_REACTIONS.map((item) => {
                const active = selected.includes(item.behavior);
                return (
                  <Pressable
                    key={item.behavior}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    onPress={() => toggleBehavior(item.behavior)}
                    style={[styles.reactionChoice, active && styles.reactionChoiceActive]}
                  >
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={active ? colors.primary : colors.textMuted}
                    />
                    <Text variant="body">{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              label="Vedi risultato"
              disabled={selected.length === 0}
              onPress={() => setPhase('result')}
              fullWidth
            />
          </>
        )}

        {phase === 'result' && (
          <>
            <Text variant="eyebrow">Risposta osservata</Text>
            <Text variant="title">{summary}</Text>
            {reactionLatencyMs !== null && (
              <View style={styles.metricCard}>
                <Text variant="eyebrow">TEMPO DI RISPOSTA</Text>
                <Text variant="display">
                  {(reactionLatencyMs / 1000).toFixed(1).replace('.', ',')} s
                </Text>
              </View>
            )}
            <Text variant="body" color={colors.textSecondary}>
              Questo descrive il tentativo di oggi, non il significato universale del suono.
            </Text>
            <Text variant="button">Quanto sei sicuro di ciò che hai osservato?</Text>
            <View style={styles.feedbackRow}>
              <Feedback label="Sicuro" icon="checkmark" onPress={() => void save('YES')} />
              <Feedback label="Non sicuro" icon="help" onPress={() => void save('UNKNOWN')} />
              <Feedback label="Da correggere" icon="close" onPress={() => void save('NO')} />
            </View>
          </>
        )}

        {phase === 'saved' && (
          <>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={34} color={colors.surface} />
            </View>
            <Text variant="eyebrow">Tentativo salvato</Text>
            <Text variant="title">La mappa di {dog.name} ha un dato in più.</Text>
            <Text variant="body" color={colors.textSecondary}>
              Dogly cercherà ricorrenze solo dopo più esperimenti confermati.
            </Text>
            <AppButton label="Torna alla mappa" onPress={() => router.replace('/signals')} fullWidth />
          </>
        )}

        {phase === 'error' && (
          <>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-outline" size={30} color={colors.danger} />
            </View>
            <Text variant="title">Esperimento interrotto</Text>
            <Text variant="body" color={colors.textSecondary}>{errorMessage}</Text>
            <AppButton label="Riprova" onPress={() => setPhase('intro')} fullWidth />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text variant="caption" color={colors.textSecondary}>{text}</Text>
    </View>
  );
}

function Feedback({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.feedbackButton}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

type CopyVariant = 'caption' | 'eyebrow' | 'body' | 'button' | 'title' | 'display';

function Text({
  children,
  variant = 'body',
  color,
  style,
}: {
  children: ReactNode;
  variant?: CopyVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <RNText style={[copyStyles[variant], color ? { color } : null, style]}>{children}</RNText>;
}

function AppButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return <Button title={label} onPress={onPress} disabled={disabled} />;
}

const copyStyles = StyleSheet.create({
  caption: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.2,
  },
  body: {
    color: colors.text,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  button: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    lineHeight: typography.size.xxl * typography.lineHeight.tight,
  },
  display: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  progressTrack: {
    backgroundColor: colors.primarySoft,
    borderRadius: 3,
    flex: 1,
    height: 5,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: colors.primary, height: 5 },
  stepBadge: { minWidth: 52 },
  cameraWrap: {
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    height: 250,
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: { flex: 1 },
  cameraPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  liveOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(26,31,29,0.68)',
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.sm,
  },
  liveDot: { backgroundColor: colors.danger, borderRadius: 4, height: 8, width: 8 },
  content: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.md,
    ...shadows.card,
  },
  infoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  reactionButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 72,
    gap: spacing.xs,
    height: 144,
    justifyContent: 'center',
    marginTop: spacing.md,
    width: 144,
    ...shadows.card,
  },
  reactionButtonDone: { backgroundColor: colors.success },
  reactionList: { gap: spacing.xs },
  reactionChoice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  reactionChoiceActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  metricCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  feedbackRow: { flexDirection: 'row', gap: spacing.sm },
  feedbackButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  successIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.success,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  errorIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
});

/**
 * Behavior capture (Spec V1 sez. 6, 13) — CameraView reale, 5–20s, mic opzionale.
 */
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  CAPTURE_MAX_SECONDS,
  CAPTURE_MIN_SECONDS,
  captureReducer,
  formatCaptureTimer,
  initialCaptureState,
} from '@/features/core/captureMachine';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useCheckIn } from '@/features/checkin/store';
import { useSession } from '@/features/auth/SessionProvider';
import {
  discardPendingBehaviorClip,
  enqueueAndUploadBehaviorClip,
} from '@/features/behavior/upload';
import { isQuotaExhaustedError } from '@/features/behavior/api';
import { isApiConfigured } from '@/features/auth/env';

export default function BehaviorCaptureScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const { analysisContext } = useCheckIn();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromCheckIn =
    params.from === 'checkin' || analysisContext?.concern === 'off';

  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const pendingUriRef = useRef<string | null>(null);
  const uploadStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const permissionReadyRef = useRef(false);
  const recordingPromiseRef = useRef<Promise<{ uri?: string } | undefined> | null>(
    null,
  );
  const canStopRef = useRef(false);
  const allowStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const micGranted = Boolean(micPermission?.granted);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearAllowStopTimer = () => {
    if (allowStopTimerRef.current) {
      clearTimeout(allowStopTimerRef.current);
      allowStopTimerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      clearAllowStopTimer();
      try {
        cameraRef.current?.stopRecording();
      } catch {
        // noop
      }
    };
  }, []);

  useEffect(() => {
    if (permissionReadyRef.current) return;
    (async () => {
      if (!cameraPermission) return;
      if (!cameraPermission.granted) {
        const cam = await requestCameraPermission();
        if (!cam.granted) {
          dispatch({ type: 'PERMISSION_DENIED' });
          return;
        }
      }
      let micOk = Boolean(micPermission?.granted);
      if (!micOk) {
        const mic = await requestMicPermission();
        micOk = mic.granted;
      }
      permissionReadyRef.current = true;
      dispatch({ type: 'PERMISSION_GRANTED', micGranted: micOk });
    })();
  }, [
    cameraPermission,
    micPermission,
    requestCameraPermission,
    requestMicPermission,
  ]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (
        next !== 'active' &&
        state.phase === 'recording' &&
        canStopRef.current
      ) {
        try {
          cameraRef.current?.stopRecording();
        } catch {
          // noop
        }
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [state.phase]);

  const finishWithUri = useCallback((uri: string | null, seconds: number) => {
    clearTimer();
    if (!uri || seconds < CAPTURE_MIN_SECONDS) {
      pendingUriRef.current = null;
      dispatch({ type: 'RESET' });
      // Force too_short UI
      dispatch({ type: 'START' });
      for (let i = 0; i < Math.max(0, seconds); i += 1) {
        dispatch({ type: 'TICK' });
      }
      dispatch({ type: 'STOP' });
      return;
    }
    pendingUriRef.current = uri;
    uploadStartedRef.current = false;
    dispatch({ type: 'RESET' });
    dispatch({ type: 'START' });
    for (let i = 0; i < Math.min(seconds, CAPTURE_MAX_SECONDS); i += 1) {
      dispatch({ type: 'TICK' });
    }
    if (seconds < CAPTURE_MAX_SECONDS) {
      dispatch({ type: 'STOP' });
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingPromiseRef.current) return;
    if (!cameraReady || !cameraRef.current) {
      setUploadError('Fotocamera non pronta. Aspetta un attimo e riprova.');
      return;
    }

    setUploadError(null);
    pendingUriRef.current = null;
    uploadStartedRef.current = false;
    canStopRef.current = false;
    setCanStop(false);
    elapsedRef.current = 0;
    clearTimer();
    clearAllowStopTimer();
    dispatch({ type: 'START' });

    const recording = cameraRef.current.recordAsync({
      maxDuration: CAPTURE_MAX_SECONDS,
    });
    recordingPromiseRef.current = recording;

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      dispatch({ type: 'TICK' });
      if (elapsedRef.current >= CAPTURE_MAX_SECONDS && canStopRef.current) {
        try {
          cameraRef.current?.stopRecording();
        } catch {
          // noop
        }
      }
    }, 1000);

    // Android: stopRecording prima che il muxer abbia frame → video vuoto.
    allowStopTimerRef.current = setTimeout(() => {
      canStopRef.current = true;
      if (mountedRef.current) setCanStop(true);
    }, 700);

    try {
      const result = await recording;
      if (!mountedRef.current) return;
      finishWithUri(result?.uri ?? null, elapsedRef.current);
    } catch {
      clearTimer();
      if (mountedRef.current) {
        setUploadError(
          'La registrazione si è chiusa subito. Riprova tenendo fermo il telefono.',
        );
        dispatch({ type: 'RESET' });
      }
    } finally {
      recordingPromiseRef.current = null;
      canStopRef.current = false;
      clearAllowStopTimer();
      if (mountedRef.current) setCanStop(false);
    }
  }, [cameraReady, finishWithUri]);

  const stopRecording = useCallback(() => {
    if (!canStopRef.current || !recordingPromiseRef.current) return;
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // noop
    }
  }, []);

  const retake = useCallback(() => {
    const discardedUri = pendingUriRef.current;
    pendingUriRef.current = null;
    uploadStartedRef.current = false;
    setUploadError(null);
    setUploading(false);
    dispatch({ type: 'RESET' });
    // Il video scartato non deve restare in coda SQLite: il drain lo
    // riproverebbe a ogni resume anche se l'utente lo ha buttato.
    if (discardedUri && userId) {
      void discardPendingBehaviorClip(userId, discardedUri);
    }
  }, [userId]);

  // Upload dopo clip valida
  useEffect(() => {
    if (state.phase !== 'completed') return;
    if (uploadStartedRef.current) return;
    const uri = pendingUriRef.current;
    if (!uri) return;

    uploadStartedRef.current = true;
    setUploading(true);
    setUploadError(null);

    (async () => {
      try {
        if (usingMockGate || !isApiConfigured() || !userId || !dog.id) {
          router.replace('/behavior/processing/evt-processing');
          return;
        }
        const durationMs = Math.max(
          CAPTURE_MIN_SECONDS * 1000,
          Math.min(CAPTURE_MAX_SECONDS * 1000, elapsedRef.current * 1000),
        );
        const { eventId } = await enqueueAndUploadBehaviorClip({
          userId,
          dogId: dog.id,
          localUri: uri,
          durationMs,
          hasAudio: micGranted && !state.audioDegraded,
        });
        router.replace(`/behavior/processing/${eventId}`);
      } catch (err) {
        if (isQuotaExhaustedError(err)) {
          // Quota esaurita (402 QUOTA_EXHAUSTED): paywall, non errore generico.
          router.replace('/paywall');
          return;
        }
        uploadStartedRef.current = false;
        setUploading(false);
        setUploadError(
          'Upload non riuscito. Il video resta in coda: puoi riprovare.',
        );
      }
    })();
  }, [
    state.phase,
    state.audioDegraded,
    usingMockGate,
    userId,
    dog.id,
    micGranted,
    router,
  ]);

  const retryUpload = async () => {
    const uri = pendingUriRef.current;
    if (!uri || !userId || !dog.id) {
      retake();
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const durationMs = Math.max(
        CAPTURE_MIN_SECONDS * 1000,
        elapsedRef.current * 1000,
      );
      const { eventId } = await enqueueAndUploadBehaviorClip({
        userId,
        dogId: dog.id,
        localUri: uri,
        durationMs,
        hasAudio: micGranted && !state.audioDegraded,
      });
      router.replace(`/behavior/processing/${eventId}`);
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        router.replace('/paywall');
        return;
      }
      setUploading(false);
      setUploadError('Upload non riuscito. Riprova.');
    }
  };

  const progress = state.elapsedSeconds / CAPTURE_MAX_SECONDS;
  const showCamera =
    state.phase !== 'permission_denied' && Boolean(cameraPermission?.granted);

  return (
    <ScreenContainer padded={false}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle}>
            {fromCheckIn ? `Guardiamo ${dog.name}` : `Capisci ${dog.name}`}
          </Text>
          <View style={styles.topSpacer} />
        </View>

        {fromCheckIn && analysisContext?.note ? (
          <Text style={styles.careBanner}>{analysisContext.note}</Text>
        ) : null}

        <View style={styles.preview}>
          {state.phase === 'permission_denied' ? (
            <View style={styles.previewCenter}>
              <Ionicons
                name="videocam-off-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={styles.permissionTitle}>Serve la fotocamera</Text>
              <Text style={styles.permissionText}>
                Per capire {dog.name} registro un breve video. Il microfono è
                facoltativo: senza audio l'analisi funziona comunque, con meno
                segnali.
              </Text>
              <Button
                title="Abilita fotocamera"
                onPress={() => void requestCameraPermission()}
                style={styles.permissionButton}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.permissionLink}>Apri impostazioni</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {showCamera ? (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  mode="video"
                  mute={!micGranted}
                  videoStabilizationMode="off"
                  active
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() => setCameraReady(false)}
                />
              ) : (
                <View style={styles.previewCenter}>
                  <Ionicons name="paw" size={64} color={colors.textMuted} />
                </View>
              )}
              {state.phase === 'recording' && (
                <View style={styles.recordingChip}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingChipText}>
                    {formatCaptureTimer(state.elapsedSeconds)} /{' '}
                    {formatCaptureTimer(CAPTURE_MAX_SECONDS)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.controls}>
          {uploadError ? (
            <Text style={styles.audioNote}>{uploadError}</Text>
          ) : null}

          {(state.phase === 'ready' || state.phase === 'recording') &&
            !uploading && (
            <>
              {state.phase === 'recording' ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, progress * 100)}%` },
                    ]}
                  />
                </View>
              ) : (
                <Text style={styles.hint}>
                  {cameraReady
                    ? `Tocca il pulsante rosso. Non tenere premuto: registro da ${CAPTURE_MIN_SECONDS} a ${CAPTURE_MAX_SECONDS} secondi.`
                    : 'Attendi, sto aprendo la fotocamera…'}
                </Text>
              )}
              {state.phase === 'ready' && state.audioDegraded && (
                <Text style={styles.audioNote}>
                  Microfono non disponibile: analizzerò solo il video.
                </Text>
              )}
              {state.phase === 'ready' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Inizia registrazione"
                  disabled={!cameraReady}
                  onPress={() => void startRecording()}
                  hitSlop={16}
                  style={({ pressed }) => [
                    styles.recordButton,
                    !cameraReady && styles.recordButtonDisabled,
                    pressed && styles.recordButtonPressed,
                  ]}
                  testID="capture-start"
                >
                  <View style={styles.recordButtonInner} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Termina registrazione"
                  disabled={!canStop}
                  onPress={stopRecording}
                  hitSlop={16}
                  style={[
                    styles.recordButton,
                    styles.recordButtonActive,
                    !canStop && styles.recordButtonDisabled,
                  ]}
                  testID="capture-stop"
                >
                  <View style={styles.stopButtonInner} />
                </Pressable>
              )}
              {state.phase === 'recording' ? (
                <Text style={styles.hintSmall}>
                  {canStop
                    ? `Sto registrando. Tocca il quadratino per fermare, dopo almeno ${CAPTURE_MIN_SECONDS} secondi.`
                    : 'Attendi: sto avviando la registrazione…'}
                </Text>
              ) : null}
            </>
          )}

          {state.phase === 'too_short' && (
            <>
              <View style={styles.tooShortCard}>
                <Ionicons name="time-outline" size={22} color={colors.warning} />
                <Text style={styles.tooShortText}>
                  Il video è troppo corto: mi servono almeno{' '}
                  {CAPTURE_MIN_SECONDS} secondi per osservare {dog.name}. Nessuna
                  analisi è stata usata.
                </Text>
              </View>
              <Button
                title="Registra di nuovo"
                onPress={retake}
                testID="capture-retry"
              />
            </>
          )}

          {(state.phase === 'completed' || uploading) && !uploadError && (
            <Text style={styles.hint}>Video pronto: lo sto inviando…</Text>
          )}

          {uploadError ? (
            <View style={{ gap: spacing.md, alignSelf: 'stretch' }}>
              <Button title="Riprova invio" onPress={() => void retryUpload()} />
              <Button title="Registra di nuovo" variant="outline" onPress={retake} />
            </View>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  topSpacer: {
    width: 26,
  },
  careBanner: {
    marginBottom: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  preview: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  previewCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  permissionButton: {
    alignSelf: 'stretch',
  },
  permissionLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primaryBright,
  },
  recordingChip: {
    position: 'absolute',
    top: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlayDark,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingChipText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textOnPrimary,
  },
  controls: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 180,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  hintSmall: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  audioNote: {
    fontSize: typography.size.xs,
    color: colors.warning,
    textAlign: 'center',
  },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  recordButtonPressed: {
    opacity: 0.85,
  },
  recordButtonActive: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 6,
    transform: [{ scale: 1.04 }],
  },
  recordButtonDisabled: {
    opacity: 0.45,
  },
  recordButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.danger,
  },
  stopButtonInner: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.danger,
  },
  tooShortCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tooShortText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
});

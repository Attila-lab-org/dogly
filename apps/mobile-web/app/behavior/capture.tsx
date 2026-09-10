/**
 * Behavior capture (Spec V1 sez. 6, 13) — CameraView reale, 5–20s, mic opzionale.
 */
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
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
import {
  startWebVideoRecording,
  type WebVideoRecording,
} from '@/features/behavior/webRecord';

const TITLE_COLOR = '#1A2B48';
const HINT_COLOR = '#64748B';
const CARD_BORDER = '#EDF2F7';
const RING_GRADIENT = ['#0050D8', '#01AEC5'] as const;

export default function BehaviorCaptureScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { loading: sessionLoading, userId, usingMockGate } = useSession();
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
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

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
  const webRecordingRef = useRef<WebVideoRecording | null>(null);
  const webHasAudioRef = useRef(false);
  const webMimeTypeRef = useRef<string | null>(null);
  const startLockRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const micGranted = Boolean(micPermission?.granted);
  const isRecording = state.phase === 'recording';

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
      if (Platform.OS === 'web') {
        webRecordingRef.current?.stop();
      } else {
        try {
          cameraRef.current?.stopRecording();
        } catch {
          // noop
        }
      }
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isRecording || reduceMotion) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 550,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 550,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulseAnim, reduceMotion]);

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
        if (Platform.OS === 'web') {
          webRecordingRef.current?.stop();
        } else {
          try {
            cameraRef.current?.stopRecording();
          } catch {
            // noop
          }
        }
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [state.phase]);

  const finishWithUri = useCallback((uri: string | null, seconds: number) => {
    clearTimer();
    if (!uri) {
      pendingUriRef.current = null;
      dispatch({ type: 'RESET' });
      setUploadError(
        'La registrazione non ha prodotto un video. Riprova e tieni premuto Stop fino alla fine.',
      );
      return;
    }
    if (seconds < CAPTURE_MIN_SECONDS) {
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
    if (recordingPromiseRef.current || startLockRef.current) return;
    if (!cameraReady || (Platform.OS !== 'web' && !cameraRef.current)) {
      setUploadError('Fotocamera non pronta. Aspetta un attimo e riprova.');
      return;
    }
    startLockRef.current = true;

    setUploadError(null);
    pendingUriRef.current = null;
    uploadStartedRef.current = false;
    canStopRef.current = false;
    setCanStop(false);
    elapsedRef.current = 0;
    clearTimer();
    clearAllowStopTimer();

    let recording: Promise<{ uri?: string } | undefined>;
    if (Platform.OS === 'web') {
      try {
        const session = await startWebVideoRecording({
          includeAudio: !state.audioDegraded,
        });
        webRecordingRef.current = session;
        webHasAudioRef.current = session.hasAudio;
        webMimeTypeRef.current = session.mimeType;
        if (!session.hasAudio && !state.audioDegraded) {
          dispatch({ type: 'PERMISSION_GRANTED', micGranted: false });
        }
        recording = session.finished.then((uri) =>
          uri ? { uri } : { uri: undefined },
        );
      } catch (error) {
        startLockRef.current = false;
        setUploadError(
          error instanceof Error
            ? error.message
            : 'Non sono riuscito ad avviare la registrazione.',
        );
        return;
      }
    } else {
      recording = cameraRef.current!.recordAsync({
        maxDuration: CAPTURE_MAX_SECONDS,
      });
    }

    dispatch({ type: 'START' });
    recordingPromiseRef.current = recording;

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      if (elapsedRef.current >= CAPTURE_MAX_SECONDS) {
        if (Platform.OS === 'web') {
          webRecordingRef.current?.stop();
        } else {
          try {
            cameraRef.current?.stopRecording();
          } catch {
            // noop
          }
        }
        clearTimer();
        return;
      }
      dispatch({ type: 'TICK' });
    }, 1000);

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
      startLockRef.current = false;
      recordingPromiseRef.current = null;
      webRecordingRef.current = null;
      canStopRef.current = false;
      clearAllowStopTimer();
      if (mountedRef.current) setCanStop(false);
    }
  }, [cameraReady, finishWithUri, state.audioDegraded]);

  const stopRecording = useCallback(() => {
    if (!canStopRef.current) return;
    if (Platform.OS === 'web') {
      const session = webRecordingRef.current;
      if (!session) return;
      session.stop();
      return;
    }
    if (!recordingPromiseRef.current) return;
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
    if (!usingMockGate && sessionLoading) return;

    uploadStartedRef.current = true;
    setUploading(true);
    setUploadError(null);

    (async () => {
      try {
        if (usingMockGate) {
          router.replace('/behavior/processing/evt-processing');
          return;
        }
        if (!userId || !dog.id) {
          throw new Error('Sessione non pronta');
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
          hasAudio:
            Platform.OS === 'web'
              ? webHasAudioRef.current
              : micGranted && !state.audioDegraded,
          contentType:
            Platform.OS === 'web' ? webMimeTypeRef.current ?? undefined : undefined,
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
    sessionLoading,
    userId,
    dog.id,
    micGranted,
    router,
  ]);

  const retryUpload = async () => {
    const uri = pendingUriRef.current;
    if (!uri) {
      retake();
      return;
    }
    if (!userId || !dog.id) {
      setUploadError('Sessione non disponibile. Attendi e riprova.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const durationMs = Math.max(
        CAPTURE_MIN_SECONDS * 1000,
        Math.min(CAPTURE_MAX_SECONDS * 1000, elapsedRef.current * 1000),
      );
      const { eventId } = await enqueueAndUploadBehaviorClip({
        userId,
        dogId: dog.id,
        localUri: uri,
        durationMs,
        hasAudio:
          Platform.OS === 'web'
            ? webHasAudioRef.current
            : micGranted && !state.audioDegraded,
        contentType:
          Platform.OS === 'web' ? webMimeTypeRef.current ?? undefined : undefined,
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

  const showCamera =
    state.phase !== 'permission_denied' && Boolean(cameraPermission?.granted);

  const timerLabel =
    state.phase === 'recording'
      ? `${formatCaptureTimer(state.elapsedSeconds)} / ${formatCaptureTimer(CAPTURE_MAX_SECONDS)}`
      : cameraReady
        ? 'Pronto'
        : 'Apro la fotocamera…';

  return (
    <ScreenContainer
      padded={false}
      style={styles.screen}
      contentStyle={styles.screenContent}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Indietro"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={24} color={TITLE_COLOR} />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            Osserva {dog.name}
          </Text>
          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torchOn ? 'Spegni flash' : 'Accendi flash'}
              onPress={() => setTorchOn((v) => !v)}
              hitSlop={10}
              style={styles.iconButton}
              disabled={facing === 'front' || !showCamera}
            >
              <Ionicons
                name={torchOn ? 'flash' : 'flash-outline'}
                size={22}
                color={
                  facing === 'front' || !showCamera
                    ? colors.iconMuted
                    : TITLE_COLOR
                }
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inverti fotocamera"
              onPress={() => {
                setTorchOn(false);
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
              }}
              hitSlop={10}
              style={styles.iconButton}
              disabled={!showCamera || isRecording}
            >
              <Ionicons
                name="camera-reverse-outline"
                size={22}
                color={!showCamera || isRecording ? colors.iconMuted : TITLE_COLOR}
              />
            </Pressable>
          </View>
        </View>

        {fromCheckIn && analysisContext?.note ? (
          <Text style={styles.careBanner}>{analysisContext.note}</Text>
        ) : null}

        <View style={styles.preview}>
          {state.phase === 'permission_denied' ? (
            <View style={styles.permissionCard}>
              <View style={styles.permissionIconWrap}>
                <Ionicons name="videocam-off-outline" size={28} color={colors.teal} />
              </View>
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
                  facing={facing}
                  mode="video"
                  mute={!micGranted}
                  videoQuality="720p"
                  videoStabilizationMode="auto"
                  enableTorch={torchOn && facing === 'back'}
                  active
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() => setCameraReady(false)}
                />
              ) : (
                <View style={styles.previewCenter}>
                  <Ionicons name="paw" size={56} color={colors.iconMuted} />
                </View>
              )}
              <View
                style={[
                  styles.timerPill,
                  isRecording ? styles.timerPillRecording : styles.timerPillReady,
                ]}
              >
                {isRecording ? (
                  <Animated.View
                    style={[styles.recordingDot, { opacity: pulseAnim }]}
                  />
                ) : (
                  <View style={styles.readyDot} />
                )}
                <Text
                  style={[
                    styles.timerPillText,
                    isRecording && styles.timerPillTextRecording,
                  ]}
                >
                  {timerLabel}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.controls}>
          {uploadError ? (
            <View style={styles.fallbackCard}>
              <Text style={styles.fallbackText}>{uploadError}</Text>
            </View>
          ) : null}

          {(state.phase === 'ready' || state.phase === 'recording') &&
            !uploading && (
            <>
              {state.phase === 'ready' && state.audioDegraded ? (
                <View style={styles.fallbackCard}>
                  <Text style={styles.fallbackText}>
                    Microfono non disponibile: analizzerò solo il video.
                  </Text>
                  <Button
                    title="Abilita microfono"
                    variant="outline"
                    onPress={async () => {
                      const permission = await requestMicPermission();
                      if (permission.granted) {
                        dispatch({
                          type: 'PERMISSION_GRANTED',
                          micGranted: true,
                        });
                      } else if (permission.canAskAgain === false) {
                        await Linking.openSettings();
                      }
                    }}
                    style={styles.micButton}
                  />
                </View>
              ) : null}

              {state.phase === 'ready' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Inizia registrazione"
                  disabled={!cameraReady}
                  onPress={() => void startRecording()}
                  hitSlop={16}
                  style={({ pressed }) => [
                    styles.captureOuter,
                    !cameraReady && styles.captureDisabled,
                    pressed && styles.capturePressed,
                  ]}
                  testID="capture-start"
                >
                  <LinearGradient
                    colors={[...RING_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.captureRing}
                  >
                    <View style={styles.captureInner}>
                      <View style={styles.captureLens} />
                    </View>
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Termina registrazione"
                  disabled={!canStop}
                  onPress={stopRecording}
                  hitSlop={16}
                  style={[
                    styles.captureOuter,
                    !canStop && styles.captureDisabled,
                  ]}
                  testID="capture-stop"
                >
                  <LinearGradient
                    colors={[...RING_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.captureRing}
                  >
                    <View style={styles.captureInner}>
                      <View style={styles.stopSquare} />
                    </View>
                  </LinearGradient>
                </Pressable>
              )}

              <Text style={styles.hint}>
                {state.phase === 'recording'
                  ? canStop
                    ? `Sto registrando. Tocca per fermare dopo almeno ${CAPTURE_MIN_SECONDS} secondi.`
                    : 'Attendi: sto avviando la registrazione…'
                  : cameraReady
                    ? `Tieni inquadrato ${dog.name} per 5-15 secondi`
                    : 'Attendi, sto aprendo la fotocamera…'}
              </Text>
            </>
          )}

          {state.phase === 'too_short' && (
            <View style={styles.fallbackCard}>
              <View style={styles.tooShortRow}>
                <View style={styles.tooShortIcon}>
                  <Ionicons name="time-outline" size={20} color={colors.coral} />
                </View>
                <Text style={styles.fallbackText}>
                  Il video è troppo corto: mi servono almeno{' '}
                  {CAPTURE_MIN_SECONDS} secondi per osservare {dog.name}. Nessuna
                  analisi è stata usata.
                </Text>
              </View>
              <Button
                title="Registra di nuovo"
                onPress={retake}
                testID="capture-retry"
                style={styles.fullButton}
              />
            </View>
          )}

          {(state.phase === 'completed' || uploading) && !uploadError && (
            <View style={styles.fallbackCard}>
              <Text style={styles.hint}>Video pronto: lo sto inviando…</Text>
            </View>
          )}

          {uploadError ? (
            <View style={styles.uploadActions}>
              <Button
                title="Riprova invio"
                onPress={() => void retryUpload()}
                style={styles.fullButton}
              />
              <Button
                title="Registra di nuovo"
                variant="outline"
                onPress={retake}
                style={styles.fullButton}
              />
            </View>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  screenContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: TITLE_COLOR,
    marginHorizontal: spacing.sm,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careBanner: {
    marginBottom: spacing.md,
    fontSize: 13,
    color: HINT_COLOR,
    textAlign: 'center',
    lineHeight: 18,
  },
  preview: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...shadows.card,
  },
  previewCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionCard: {
    margin: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.card,
  },
  permissionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: TITLE_COLOR,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 13,
    color: HINT_COLOR,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    alignSelf: 'stretch',
  },
  permissionLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.teal,
  },
  timerPill: {
    position: 'absolute',
    top: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  timerPillReady: {
    backgroundColor: '#E0F7F6',
  },
  timerPillRecording: {
    backgroundColor: '#FFF1EE',
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.teal,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  timerPillText: {
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: TITLE_COLOR,
  },
  timerPillTextRecording: {
    color: '#C2410C',
  },
  controls: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 168,
  },
  hint: {
    fontSize: 13,
    color: HINT_COLOR,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  captureOuter: {
    ...shadows.raised,
  },
  captureRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  captureInner: {
    width: '100%',
    height: '100%',
    borderRadius: 37,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLens: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.teal,
  },
  stopSquare: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.coral,
  },
  capturePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  captureDisabled: {
    opacity: 0.45,
  },
  fallbackCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  fallbackText: {
    flex: 1,
    fontSize: 13,
    color: HINT_COLOR,
    lineHeight: 19,
    textAlign: 'center',
  },
  tooShortRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tooShortIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    alignSelf: 'stretch',
  },
  uploadActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  fullButton: {
    alignSelf: 'stretch',
  },
});

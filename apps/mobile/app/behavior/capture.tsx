/**
 * Behavior capture (Spec V1 sez. 6, 13) — registrazione video in-app.
 * Stati obbligatori: ready, recording, too short, hard cap 20 s,
 * permission denied. Mic separato: se negato si prosegue video-only
 * con evidenza ridotta (sez. 13.1), mai bloccante.
 *
 * La logica di stato vive in src/features/core/captureMachine.ts (pura,
 * testata). L'integrazione nativa expo-camera è un blocker aperto
 * (docs/DECISIONS.md): questa schermata implementa UX e contratto con
 * una preview simulata, pronta a ospitare la CameraView.
 */
import React, { useEffect, useReducer, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  CAPTURE_MAX_SECONDS,
  CAPTURE_MIN_SECONDS,
  captureReducer,
  formatCaptureTimer,
  initialCaptureState,
} from '@/features/core/captureMachine';

export default function BehaviorCaptureScreen() {
  const router = useRouter();
  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Permesso camera just-in-time (sez. 13.1): simulato finché non
  // integriamo expo-camera. Mic concesso nel mock; il permesso negato è
  // comunque coperto dallo stato permission_denied della macchina.
  useEffect(() => {
    const t = setTimeout(
      () => dispatch({ type: 'PERMISSION_GRANTED', micGranted: true }),
      400,
    );
    return () => clearTimeout(t);
  }, []);

  // Timer di registrazione: 1 tick/secondo, stop automatico all'hard cap
  useEffect(() => {
    if (state.phase === 'recording') {
      timerRef.current = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.phase]);

  // Clip valida → upload/processing (mock: evento in lavorazione)
  useEffect(() => {
    if (state.phase === 'completed') {
      router.replace('/behavior/processing/evt-processing');
    }
  }, [state.phase, router]);

  const progress = state.elapsedSeconds / CAPTURE_MAX_SECONDS;

  return (
    <ScreenContainer padded={false}>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle}>Capisci Rocky</Text>
          <View style={styles.topSpacer} />
        </View>

        {/* Preview camera (simulata: placeholder fino a expo-camera) */}
        <View style={styles.preview}>
          {state.phase === 'permission_denied' ? (
            <View style={styles.previewCenter}>
              <Ionicons name="videocam-off-outline" size={48} color={colors.textMuted} />
              <Text style={styles.permissionTitle}>Serve la fotocamera</Text>
              <Text style={styles.permissionText}>
                Per capire Rocky registro un breve video. Il microfono è
                facoltativo: senza audio l'analisi funziona comunque, con meno
                segnali.
              </Text>
              <Button
                title="Abilita fotocamera"
                onPress={() => {
                  // Mock: in produzione requestCameraPermission(); se l'utente
                  // ha negato in modo permanente → Linking.openSettings()
                  dispatch({ type: 'PERMISSION_GRANTED', micGranted: true });
                }}
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
            <View style={styles.previewCenter}>
              <Ionicons name="paw" size={64} color={colors.textMuted} />
              {state.phase === 'recording' && (
                <View style={styles.recordingChip}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingChipText}>
                    {formatCaptureTimer(state.elapsedSeconds)} /{' '}
                    {formatCaptureTimer(CAPTURE_MAX_SECONDS)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Area controlli */}
        <View style={styles.controls}>
          {state.phase === 'ready' && (
            <>
              <Text style={styles.hint}>
                Inquadra Rocky e registra da {CAPTURE_MIN_SECONDS} a{' '}
                {CAPTURE_MAX_SECONDS} secondi: mi fermo da solo.
              </Text>
              {state.audioDegraded && (
                <Text style={styles.audioNote}>
                  Microfono non disponibile: analizzerò solo il video.
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Inizia registrazione"
                onPress={() => dispatch({ type: 'START' })}
                style={({ pressed }) => [
                  styles.recordButton,
                  pressed && styles.recordButtonPressed,
                ]}
                testID="capture-start"
              >
                <View style={styles.recordButtonInner} />
              </Pressable>
            </>
          )}

          {state.phase === 'recording' && (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, progress * 100)}%` },
                  ]}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Termina registrazione"
                onPress={() => dispatch({ type: 'STOP' })}
                style={({ pressed }) => [
                  styles.recordButton,
                  pressed && styles.recordButtonPressed,
                ]}
                testID="capture-stop"
              >
                <View style={styles.stopButtonInner} />
              </Pressable>
              <Text style={styles.hintSmall}>
                Puoi fermarti quando vuoi dopo {CAPTURE_MIN_SECONDS} secondi
              </Text>
            </>
          )}

          {state.phase === 'too_short' && (
            <>
              <View style={styles.tooShortCard}>
                <Ionicons name="time-outline" size={22} color={colors.warning} />
                <Text style={styles.tooShortText}>
                  Il video è troppo corto: mi servono almeno{' '}
                  {CAPTURE_MIN_SECONDS} secondi per osservare Rocky. Nessuna
                  analisi è stata usata.
                </Text>
              </View>
              <Button
                title="Registra di nuovo"
                onPress={() => dispatch({ type: 'START' })}
                testID="capture-retry"
              />
            </>
          )}

          {state.phase === 'completed' && (
            <Text style={styles.hint}>Video pronto: lo sto inviando…</Text>
          )}
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
    backgroundColor: 'rgba(14, 42, 71, 0.7)',
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

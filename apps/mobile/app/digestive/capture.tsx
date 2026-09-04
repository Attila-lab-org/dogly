/**
 * Digestive capture (Spec V1 sez. 6 — "Digestive capture": quality warning,
 * retake, upload failure). Capacità SECONDARIA: mai tab, si apre da Rocky.
 * Disclaimer gentile fisso: non è una diagnosi veterinaria (sez. 19 / O-02).
 *
 * In attesa dell'integrazione camera (Expo Camera), il flusso è mockato ma
 * gli stati UI obbligatori sono completi e deterministicamente raggiungibili.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { DIGESTIVE_DISCLAIMER } from '@/features/secondary/safetyCopy';

type Phase = 'ready' | 'preview' | 'uploading' | 'upload_failed';

interface PhotoDraft {
  qualityWarning: string | null;
}

export default function DigestiveCaptureScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('ready');
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  /** Demo deterministica: il primo scatto ha un warning di qualità, il retake è ok */
  const [shotsTaken, setShotsTaken] = useState(0);
  const [forceFailure, setForceFailure] = useState(false);

  const takePhoto = () => {
    const attempt = shotsTaken + 1;
    setShotsTaken(attempt);
    setDraft({
      qualityWarning:
        attempt === 1
          ? "La foto sembra un po' scura o mossa: il risultato potrebbe essere meno affidabile."
          : null,
    });
    setPhase('preview');
  };

  const confirmUpload = () => {
    setPhase('uploading');
    // Mock upload: failure solo se richiesto esplicitamente dal toggle demo
    setTimeout(() => {
      if (forceFailure) {
        setPhase('upload_failed');
      } else {
        router.replace('/digestive/processing/fecal-ok-1');
      }
    }, 900);
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Controlla digestione" />

      <Text style={styles.intro}>
        Fotografa le feci di Rocky: confronterò la foto con la sua baseline e
        con il cibo che sta mangiando.
      </Text>

      {/* Anteprima / area scatto */}
      <Card noPadding style={styles.photoCard}>
        <View style={styles.photoArea}>
          {draft ? (
            <>
              <Ionicons name="image" size={48} color={colors.accent} />
              <Text style={styles.photoLabel}>Foto acquisita</Text>
            </>
          ) : (
            <>
              <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
              <Text style={styles.photoLabel}>Nessuna foto ancora</Text>
            </>
          )}
        </View>
      </Card>

      {/* Quality warning + retake */}
      {draft?.qualityWarning && phase === 'preview' && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <View style={styles.warningTextWrap}>
            <Text style={styles.warningTitle}>Qualità migliorabile</Text>
            <Text style={styles.warningText}>{draft.qualityWarning}</Text>
          </View>
        </View>
      )}

      {/* Upload failure state */}
      {phase === 'upload_failed' && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
          <View style={styles.warningTextWrap}>
            <Text style={styles.errorTitle}>Caricamento non riuscito</Text>
            <Text style={styles.errorText}>
              Controlla la connessione e riprova. La foto resta sul telefono,
              non devi scattarla di nuovo.
            </Text>
          </View>
        </View>
      )}

      {/* Azioni */}
      <View style={styles.actions}>
        {phase === 'ready' && (
          <Button
            title="Scatta foto"
            icon={<Ionicons name="camera" size={18} color={colors.textOnPrimary} />}
            onPress={takePhoto}
          />
        )}
        {phase === 'preview' && (
          <>
            <Button
              title="Analizza la foto"
              icon={<Ionicons name="sparkles" size={18} color={colors.textOnPrimary} />}
              onPress={confirmUpload}
            />
            <Button
              title={draft?.qualityWarning ? 'Scatta di nuovo' : 'Rifai la foto'}
              variant="outline"
              icon={<Ionicons name="refresh" size={18} color={colors.accent} />}
              onPress={takePhoto}
            />
          </>
        )}
        {phase === 'uploading' && (
          <Button title="Caricamento in corso…" loading onPress={() => {}} />
        )}
        {phase === 'upload_failed' && (
          <>
            <Button
              title="Riprova il caricamento"
              icon={<Ionicons name="refresh" size={18} color={colors.textOnPrimary} />}
              onPress={() => {
                setForceFailure(false);
                confirmUpload();
              }}
            />
            <Button
              title="Scatta di nuovo"
              variant="outline"
              onPress={() => {
                setDraft(null);
                setPhase('ready');
              }}
            />
          </>
        )}
      </View>

      {/* Toggle demo errore upload (sviluppo) */}
      {phase !== 'uploading' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setForceFailure((v) => !v)}
          style={styles.demoToggle}
        >
          <Ionicons
            name={forceFailure ? 'checkbox' : 'square-outline'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.demoToggleText}>
            Simula errore di rete (demo stati)
          </Text>
        </Pressable>
      )}

      {/* Disclaimer gentile, sempre visibile */}
      <View style={styles.disclaimer}>
        <Ionicons name="medkit-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>{DIGESTIVE_DISCLAIMER}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  photoCard: {
    marginBottom: spacing.lg,
  },
  photoArea: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
  },
  photoLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  warningTextWrap: {
    flex: 1,
  },
  warningTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  warningText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
    marginBottom: spacing.xxs,
  },
  errorText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  demoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  demoToggleText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.none,
  },
  disclaimerText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

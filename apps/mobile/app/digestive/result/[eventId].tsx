/**
 * Digestive result (Spec V1 sez. 6.1-adattata / 19): osservazione strutturata.
 * REGOLE VINCOLANTI:
 * - fecal score 1–7 mostrato come STIMA, mai misura di laboratorio (19.1);
 * - candidati muco/sangue/melena/materiale estraneo con wording
 *   "possibile/candidato", MAI assenze provate (19.3);
 * - safety flag → copy DETERMINISTICO fisso da safetyCopy.ts, non generato;
 * - confronto Rocky-vs-Rocky con baseline e cibo attivo (19.2);
 * - nessun feedback richiesto qui; nessuna diagnosi medica.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { fecalEventsMock } from '@/mocks/secondary';
import {
  candidateText,
  ConfidenceBandPill,
  StackScreenHeader,
} from '@/features/secondary/components';
import {
  ABSENCE_NOT_PROOF_NOTE,
  DIGESTIVE_DISCLAIMER,
  FECAL_SCORE_ESTIMATE_NOTE,
  SAFETY_COPY,
} from '@/features/secondary/safetyCopy';
import type { CandidateLevel } from '@/features/secondary/types';

function ObservationRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <View style={styles.obsRow}>
      <Text style={styles.obsLabel}>{label}</Text>
      <Text style={[styles.obsValue, warn && styles.obsValueWarn]}>{value}</Text>
    </View>
  );
}

export default function DigestiveResultScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  // Niente fallback silenzioso: evento sconosciuto → ErrorState (come
  // behavior/result/[eventId].tsx), mai mostrare dati di un altro evento.
  const event = eventId ? fecalEventsMock[eventId] : undefined;

  if (!event) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Osservazione non trovata"
          message="Non riesco ad aprire questa osservazione. Controlla il Diario."
        />
        <Button
          title="Apri il Diario"
          onPress={() => router.replace('/(tabs)/diary')}
        />
      </ScreenContainer>
    );
  }

  // Stato mandatory "insufficient image" (sez. 6 / 19.1): nessuna stima,
  // UI dedicata con CTA per scattare di nuovo.
  if (event.status === 'INSUFFICIENT_IMAGE' || event.imageQuality === 'insufficient') {
    return (
      <ScreenContainer scroll>
        <StackScreenHeader title="Osservazione digestiva" />
        <View style={styles.insufficientIconWrap}>
          <Ionicons name="camera-outline" size={36} color={colors.warning} />
        </View>
        <Text style={styles.headline}>Foto non sufficiente</Text>
        <Text style={styles.insufficientText}>
          Non riesco a leggere bene questa foto: preferisco non darti numeri
          poco affidabili. Nessuna analisi è stata conteggiata.
        </Text>
        {event.qualityWarnings.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Cosa migliorare</Text>
            {event.qualityWarnings.map((warning) => (
              <View key={warning} style={styles.warningRow}>
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={colors.warning}
                />
                <Text style={styles.warningItem}>{warning}</Text>
              </View>
            ))}
          </Card>
        )}
        <Button
          title="Scatta di nuovo"
          icon={
            <Ionicons name="camera" size={18} color={colors.textOnPrimary} />
          }
          onPress={() => router.replace('/digestive/capture')}
          testID="digestive-retake"
        />
        <Button
          title="Torna al Diario"
          variant="outline"
          onPress={() => router.replace('/(tabs)/diary')}
          style={styles.insufficientSecondary}
        />
      </ScreenContainer>
    );
  }

  const hasSafetyFlags = event.safetyFlags.length > 0;

  const candidates: { label: string; level: CandidateLevel }[] = [
    { label: 'Muco', level: event.mucusCandidate },
    { label: 'Sangue fresco', level: event.bloodCandidate },
    { label: 'Feci nere/catramose (melena)', level: event.melenaCandidate },
    { label: 'Materiale estraneo', level: event.foreignMaterialCandidate },
  ];

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Osservazione digestiva" />

      {/* Headline probabilistica */}
      <Text style={styles.headline}>
        {hasSafetyFlags
          ? 'Qualcosa da verificare con il veterinario'
          : 'Tutto sembra nella norma'}
      </Text>
      <View style={styles.pillWrap}>
        <ConfidenceBandPill band={event.confidenceBand} />
      </View>

      {/* Safety flag: copy deterministico fisso, mai generato */}
      {event.safetyFlags.map((flag) => {
        const copy = SAFETY_COPY[flag];
        return (
          <View key={flag} style={styles.safetyCard}>
            <View style={styles.safetyHeader}>
              <Ionicons name="medkit" size={18} color={colors.danger} />
              <Text style={styles.safetyTitle}>{copy.title}</Text>
            </View>
            <Text style={styles.safetyMessage}>{copy.message}</Text>
            <Text style={styles.safetyAction}>👉 {copy.action}</Text>
          </View>
        );
      })}

      {/* Osservazione strutturata */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Cosa ho osservato</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>
              {event.fecalScoreEstimate ?? '—'}
            </Text>
            <Text style={styles.scoreScale}>/7</Text>
          </View>
          <View style={styles.scoreTextWrap}>
            <Text style={styles.scoreTitle}>Stima del punteggio fecale</Text>
            <Text style={styles.scoreNote}>{FECAL_SCORE_ESTIMATE_NOTE}</Text>
          </View>
        </View>

        <ObservationRow label="Consistenza" value={event.consistency} />
        <ObservationRow label="Colore" value={event.color} />
        {candidates.map((c) => (
          <ObservationRow
            key={c.label}
            label={c.label}
            value={candidateText(c.level)}
            warn={c.level === 'possible' || c.level === 'clear_candidate'}
          />
        ))}
      </Card>

      {/* Confronto Rocky-vs-Rocky + cibo attivo */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Rispetto al solito Rocky</Text>
        <View style={styles.compareRow}>
          <Ionicons name="analytics-outline" size={16} color={colors.accent} />
          <Text style={styles.bodyText}>{event.baselineComparison}</Text>
        </View>
        {event.activeFoodName && (
          <View style={styles.compareRow}>
            <Ionicons name="nutrition-outline" size={16} color={colors.accent} />
            <Text style={styles.bodyText}>
              Cibo in questo periodo: {event.activeFoodName}
            </Text>
          </View>
        )}
        <Text style={styles.note}>
          Un cambiamento vicino a un cambio di cibo è solo un'associazione
          temporale, non una prova di causa.
        </Text>
      </Card>

      {/* Note fisse: nessuna diagnosi, nessuna assenza provata */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{DIGESTIVE_DISCLAIMER}</Text>
        <Text style={[styles.disclaimerText, styles.disclaimerGap]}>
          {ABSENCE_NOT_PROOF_NOTE}
        </Text>
      </View>

      <Button
        title="Torna al profilo di Rocky"
        variant="outline"
        onPress={() => router.replace('/(tabs)/rocky')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  insufficientIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  insufficientText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  warningItem: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  insufficientSecondary: {
    marginTop: spacing.sm,
  },
  headline: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  pillWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  safetyCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  safetyTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.danger,
  },
  safetyMessage: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  safetyAction: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
  },
  card: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingTop: spacing.md,
  },
  scoreNumber: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.accent,
  },
  scoreScale: {
    fontSize: typography.size.sm,
    color: colors.accent,
  },
  scoreTextWrap: {
    flex: 1,
  },
  scoreTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  scoreNote: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    marginTop: spacing.xxs,
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  obsLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  obsValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textTransform: 'capitalize',
  },
  obsValueWarn: {
    color: colors.warning,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bodyText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  note: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    marginTop: spacing.xs,
  },
  disclaimer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  disclaimerText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  disclaimerGap: {
    marginTop: spacing.xs,
  },
});

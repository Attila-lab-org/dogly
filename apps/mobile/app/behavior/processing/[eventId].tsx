/**
 * Behavior processing (Spec V1 sez. 6, 7.2) — attesa guidata.
 * Stati obbligatori: queued, observing, interpreting, retrying
 * (FAILED_RETRYABLE con retry automatico idempotente), quality rejected
 * (REJECTED_QUALITY con rimborso quota, sez. 7.3), provider error
 * (FAILED_TERMINAL con rimborso + telemetria supporto).
 *
 * V1 mock: lo stato arriva da behaviorResultsMock; con il backend sarà
 * polling TanStack Query su GET /v1/behavior-events/{id} (sez. 9) +
 * aggiornamento push a COMPLETED.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { BehaviorEventStatus } from '@/contracts/types';
import { PROCESSING_STEP_ORDER, PROCESSING_STEPS } from '@/features/core/copy';
import { behaviorResultsMock } from '@/mocks/core';

/** Sequenza demo per l'evento appena registrato (mock del flusso 7.2). */
const DEMO_PROGRESSION: BehaviorEventStatus[] = [
  'QUEUED',
  'OBSERVING',
  'INTERPRETING',
  'COMPLETED',
];

export default function BehaviorProcessingScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = eventId ? behaviorResultsMock[eventId] : undefined;

  // Evento ancora in pipeline (appena registrato): simula la progressione
  // QUEUED → OBSERVING → INTERPRETING → COMPLETED (mock del flusso 7.2).
  const isInProgress =
    event?.status === 'QUEUED' ||
    event?.status === 'OBSERVING' ||
    event?.status === 'INTERPRETING';
  const [demoIndex, setDemoIndex] = useState(0);
  const status: BehaviorEventStatus | undefined = isInProgress
    ? DEMO_PROGRESSION[demoIndex]
    : event?.status;

  useEffect(() => {
    if (!isInProgress) return;
    if (demoIndex >= DEMO_PROGRESSION.length - 1) {
      // COMPLETED → result (mobile fetch/push update, sez. 7.2)
      router.replace('/behavior/result/evt-play');
      return;
    }
    const t = setTimeout(() => setDemoIndex((i) => i + 1), 1600);
    return () => clearTimeout(t);
  }, [demoIndex, isInProgress, router]);

  if (!event) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Analisi non trovata"
          message="Non riesco a trovare questa analisi. Torna alla Home e riprova."
        />
        <Button title="Torna alla Home" onPress={() => router.replace('/(tabs)/home')} />
      </ScreenContainer>
    );
  }

  /* Quality rejected: clip inutilizzabile, quota rimborsata (sez. 7.3) */
  if (status === 'REJECTED_QUALITY') {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="videocam-off-outline" size={36} color={colors.warning} />
          </View>
          <Text style={styles.stateTitle}>Il video non è abbastanza chiaro</Text>
          <Text style={styles.stateText}>
            Non riesco a vedere bene Rocky: possibile scarsa luce, movimento
            sfocato o inquadratura parziale. Nessuna analisi è stata usata:
            riprova quando vuoi.
          </Text>
          <Button
            title="Registra di nuovo"
            onPress={() => router.replace('/behavior/capture')}
          />
          <Button
            title="Torna alla Home"
            variant="outline"
            onPress={() => router.replace('/(tabs)/home')}
          />
        </View>
      </ScreenContainer>
    );
  }

  /* Provider error terminale: rimborso + telemetria supporto (sez. 7.2) */
  if (status === 'FAILED_TERMINAL') {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
          </View>
          <Text style={styles.stateTitle}>Qualcosa non ha funzionato</Text>
          <Text style={styles.stateText}>
            C'è stato un problema tecnico dall'altra parte. Non è colpa del
            video: l'analisi non è stata conteggiata e il problema è già stato
            segnalato.
          </Text>
          <Button
            title="Riprova"
            onPress={() => router.replace('/behavior/capture')}
          />
          <Button
            title="Torna alla Home"
            variant="outline"
            onPress={() => router.replace('/(tabs)/home')}
          />
        </View>
      </ScreenContainer>
    );
  }

  /* Pipeline attiva: stepper + eventuale banner retry */
  const currentOrder = PROCESSING_STEP_ORDER[status ?? 'QUEUED'] ?? 0;
  const isRetrying = status === 'FAILED_RETRYABLE';

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna alla Home"
          onPress={() => router.replace('/(tabs)/home')}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Analisi in corso</Text>
        <View style={styles.topSpacer} />
      </View>

      <Text style={styles.heroTitle}>Sto osservando Rocky…</Text>
      <Text style={styles.heroText}>
        Puoi chiudere questa schermata: ti avviso quando il risultato è pronto.
      </Text>

      {isRetrying && (
        <View style={styles.retryBanner}>
          <Ionicons name="refresh" size={16} color={colors.warning} />
          <Text style={styles.retryText}>
            Connessione instabile: ci riprovo automaticamente, senza usare
            altre analisi.
          </Text>
        </View>
      )}

      <Card style={styles.stepper}>
        {PROCESSING_STEPS.map((step, index) => {
          const stepOrder = PROCESSING_STEP_ORDER[step.status];
          const done = !isRetrying && stepOrder < currentOrder;
          const active = !isRetrying && stepOrder === currentOrder;
          return (
            <View key={step.status} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      active && styles.stepNumberActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              {index < PROCESSING_STEPS.length - 1 && (
                <View style={[styles.stepLine, done && styles.stepLineDone]} />
              )}
              <View style={styles.stepTextWrap}>
                <Text
                  style={[styles.stepTitle, active && styles.stepTitleActive]}
                >
                  {step.title}
                </Text>
                {(active || isRetrying) && (
                  <Text style={styles.stepDescription}>{step.description}</Text>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      <Text style={styles.quotaNote}>
        Se il video non fosse utilizzabile, l'analisi non verrà conteggiata.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  topTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  topSpacer: {
    width: 26,
  },
  heroTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  heroText: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
  },
  retryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  retryText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  stepper: {
    marginBottom: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: colors.accent,
  },
  stepDotActive: {
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  stepNumber: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  stepNumberActive: {
    color: colors.primary,
  },
  stepLine: {
    position: 'absolute',
    left: 13,
    top: 30,
    width: 2,
    height: spacing.lg,
    backgroundColor: colors.border,
  },
  stepLineDone: {
    backgroundColor: colors.accent,
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  stepTitleActive: {
    color: colors.text,
  },
  stepDescription: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  quotaNote: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  statePage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  stateIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
});

/**
 * Behavior processing — polling GET /v1/behavior/events/{id}.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { BehaviorEventStatus } from '@/contracts/types';
import { PROCESSING_STEP_ORDER, PROCESSING_STEPS } from '@/features/core/copy';
import { behaviorResultsMock } from '@/mocks/core';
import {
  getBehaviorEvent,
  IN_PROGRESS_STATUSES,
  isTerminalBehaviorStatus,
} from '@/features/behavior/api';
import { markUploadCompletedForEvent } from '@/features/behavior/upload';
import { isApiConfigured } from '@/features/auth/env';
import { useDogProfile } from '@/features/core/useDogProfile';

export default function BehaviorProcessingScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const useApi = isApiConfigured() && Boolean(eventId) && !eventId?.startsWith('evt-');

  const query = useQuery({
    queryKey: ['behavior-event', eventId],
    queryFn: () => getBehaviorEvent(eventId!),
    enabled: useApi,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || isTerminalBehaviorStatus(status)) return false;
      return 2000;
    },
  });

  const mockEvent = eventId ? behaviorResultsMock[eventId] : undefined;
  const status: BehaviorEventStatus | undefined = useApi
    ? query.data?.status
    : mockEvent?.status === 'QUEUED' ||
        mockEvent?.status === 'OBSERVING' ||
        mockEvent?.status === 'INTERPRETING'
      ? mockEvent.status
      : mockEvent?.status;

  // Mock progression for demo ids
  useEffect(() => {
    if (useApi || !mockEvent) return;
    if (mockEvent.status === 'COMPLETED') {
      router.replace(`/behavior/result/${mockEvent.eventId}`);
      return;
    }
    const order: BehaviorEventStatus[] = [
      'QUEUED',
      'OBSERVING',
      'INTERPRETING',
      'COMPLETED',
    ];
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= order.length - 1) {
        clearInterval(t);
        router.replace('/behavior/result/evt-play');
      }
    }, 1600);
    return () => clearInterval(t);
  }, [useApi, mockEvent, router]);

  useEffect(() => {
    if (!useApi || !query.data) return;
    const s = query.data.status;
    if (s === 'COMPLETED') {
      markUploadCompletedForEvent(query.data.id);
      router.replace(`/behavior/result/${query.data.id}`);
    }
  }, [useApi, query.data, router]);

  if (useApi && query.isError) {
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

  if (!useApi && !mockEvent) {
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

  if (status === 'REJECTED_QUALITY') {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="videocam-off-outline" size={36} color={colors.warning} />
          </View>
          <Text style={styles.stateTitle}>Il video non è abbastanza chiaro</Text>
          <Text style={styles.stateText}>
            Non riesco a vedere bene {dog.name}: possibile scarsa luce, movimento
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

  const displayStatus: BehaviorEventStatus =
    status && IN_PROGRESS_STATUSES.includes(status)
      ? status === 'FAILED_RETRYABLE'
        ? 'FAILED_RETRYABLE'
        : status === 'OBSERVING' || status === 'INTERPRETING' || status === 'QUEUED'
          ? status
          : 'QUEUED'
      : status ?? 'QUEUED';

  const currentOrder = PROCESSING_STEP_ORDER[displayStatus] ?? 0;
  const isRetrying = displayStatus === 'FAILED_RETRYABLE';

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

      <Text style={styles.heroTitle}>Sto osservando {dog.name}…</Text>
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

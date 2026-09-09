/**
 * Behavior processing — polling GET /v1/behavior/events/{id}.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { BehaviorEventStatus } from '@/contracts/types';
import { PROCESSING_STEP_ORDER, processingStepsFor } from '@/features/core/copy';
import { behaviorResultsMock } from '@/mocks/core';
import {
  getBehaviorEvent,
  IN_PROGRESS_STATUSES,
  isTerminalBehaviorStatus,
} from '@/features/behavior/api';
import { mockProcessingAction } from '@/features/behavior/processing';
import {
  cancelResultReadyNotification,
  scheduleResultReadyNotification,
} from '@/features/behavior/notify';
import { markUploadCompletedForEvent } from '@/features/behavior/upload';
import { isApiConfigured } from '@/features/auth/env';
import { useDogProfile } from '@/features/core/useDogProfile';
import { ProcessingCompanion } from '@/features/behavior/ProcessingCompanion';
import { useSession } from '@/features/auth/SessionProvider';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';
import {
  ANALYSIS_POLL_TIMEOUT_MS,
  analysisPollIntervalMs,
} from '@/features/core/processingTimeout';

export default function BehaviorProcessingScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const useApi =
    isApiConfigured() &&
    Boolean(userId) &&
    isPersistedId(eventId) &&
    !usingMockGate;
  const steps = useMemo(() => processingStepsFor(dog.name), [dog.name]);
  const [finishing, setFinishing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const completionStarted = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAt = useRef(Date.now());

  useEffect(
    () => () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    },
    [],
  );

  const query = useQuery({
    queryKey: queryKeys.behaviorEvent(
      userId ?? 'anon',
      dog.id,
      eventId ?? '',
    ),
    queryFn: () => getBehaviorEvent(eventId!),
    enabled: useApi,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || isTerminalBehaviorStatus(status)) return false;
      if (Date.now() - pollStartedAt.current >= ANALYSIS_POLL_TIMEOUT_MS) {
        return false;
      }
      return analysisPollIntervalMs(q.state.dataUpdateCount);
    },
  });

  const mockEvent =
    usingMockGate && eventId ? behaviorResultsMock[eventId] : undefined;
  const status: BehaviorEventStatus | undefined = useApi
    ? query.data?.status
    : mockEvent?.status === 'QUEUED' ||
        mockEvent?.status === 'OBSERVING' ||
        mockEvent?.status === 'INTERPRETING'
      ? mockEvent.status
      : mockEvent?.status;

  // Mock progression for demo ids: rispetta lo stato dell'evento richiesto
  useEffect(() => {
    if (useApi || !mockEvent) return;
    const action = mockProcessingAction(mockEvent);
    if (action.type === 'redirect-result') {
      void cancelResultReadyNotification(mockEvent.eventId);
      router.replace(`/behavior/result/${action.eventId}`);
      return;
    }
    if (action.type === 'stay') return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= steps.length) {
        clearInterval(t);
        setFinishing(true);
        void cancelResultReadyNotification(mockEvent.eventId);
        completionTimer.current = setTimeout(
          () => router.replace('/behavior/result/evt-play'),
          850,
        );
      }
    }, 1600);
    return () => clearInterval(t);
  }, [useApi, mockEvent, router, steps.length]);

  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!useApi) return;
    const timer = setTimeout(() => {
      const s = statusRef.current;
      if (!s || !isTerminalBehaviorStatus(s)) {
        setTimedOut(true);
      }
    }, ANALYSIS_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [useApi, eventId]);

  useEffect(() => {
    if (!useApi || !query.data) return;
    const s = query.data.status;
    if (isTerminalBehaviorStatus(s)) {
      markUploadCompletedForEvent(query.data.id);
      void cancelResultReadyNotification(query.data.id);
    }
    if (s === 'COMPLETED' && !completionStarted.current) {
      completionStarted.current = true;
      setFinishing(true);
      completionTimer.current = setTimeout(
        () => router.replace(`/behavior/result/${query.data!.id}`),
        850,
      );
    }
  }, [useApi, query.data, router]);

  // "Ti avviso quando il risultato è pronto": se l'utente lascia la
  // schermata prima dello stato terminale, schedula la notifica locale.
  // Al mount (rientro a guardare) la notifica pendente viene cancellata.
  useEffect(() => {
    if (!eventId) return;
    void cancelResultReadyNotification(eventId);
    return () => {
      const s = statusRef.current;
      if (s && !isTerminalBehaviorStatus(s)) {
        void scheduleResultReadyNotification(eventId, dog.name);
      }
    };
  }, [eventId, dog.name]);

  if (useApi && query.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Non riesco ad aprire l’analisi"
          message="Controlla la connessione e riprova. Se l’elaborazione è partita, ritroverai il risultato nel Diario."
          onRetry={() => void query.refetch()}
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

  if (status === 'DRAFT' || status === 'UPLOADING') {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="cloud-upload-outline" size={36} color={colors.primary} />
          </View>
          <Text style={styles.stateTitle}>Sto completando l’invio</Text>
          <Text style={styles.stateText}>
            Conserva la connessione per qualche momento. Il video rimane sul
            telefono finché l’invio non è verificato.
          </Text>
          <Button
            title="Torna alla Home"
            variant="outline"
            onPress={() => router.replace('/(tabs)/home')}
          />
        </View>
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
            sfocato o inquadratura parziale. Questa prova non viene conteggiata:
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

  if (
    timedOut &&
    useApi &&
    (!status || !isTerminalBehaviorStatus(status))
  ) {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="time-outline" size={36} color={colors.warning} />
          </View>
          <Text style={styles.stateTitle}>L’analisi sta impiegando troppo</Text>
          <Text style={styles.stateText}>
            Sto ancora lavorando in background e ti avviso se il risultato
            arriva. Questa attesa non viene conteggiata come un’analisi
            andata a buon fine: puoi riprovare o tornare più tardi dal Diario.
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

  if (status === 'CANCELLED') {
    return (
      <ScreenContainer>
        <View style={styles.statePage}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="close-circle-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.stateTitle}>Analisi annullata</Text>
          <Text style={styles.stateText}>
            Questa analisi non è stata completata e non verrà conteggiata.
          </Text>
          <Button
            title="Registra un nuovo video"
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
        <Text style={styles.topTitle}>Sto guardando {dog.name}</Text>
        <View style={styles.topSpacer} />
      </View>

      <ProcessingCompanion
        dogName={dog.name}
        status={displayStatus}
        finishing={finishing}
      />

      <Text style={styles.heroText}>
        Puoi anche chiudere. Se hai attivato le notifiche, ti avviso quando il
        risultato è pronto; altrimenti lo ritrovi nel Diario.
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

      <View style={styles.stepper}>
        {steps.map((step, index) => {
          const stepOrder = PROCESSING_STEP_ORDER[step.status];
          const done = !isRetrying && stepOrder < currentOrder;
          const active = !isRetrying && stepOrder === currentOrder;
          return (
            <View key={step.id} style={styles.stepRow}>
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
                  <View style={[styles.stepInnerDot, active && styles.stepInnerDotActive]} />
                )}
              </View>
              {index < steps.length - 1 && (
                <View style={[styles.stepLine, done && styles.stepLineDone]} />
              )}
              <View style={styles.stepTextWrap}>
                <Text
                  style={[styles.stepTitle, active && styles.stepTitleActive]}
                >
                  {step.title}
                </Text>
                {(active || done) && (
                  <Text style={styles.stepDescription}>{step.description}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
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
  heroText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
    textAlign: 'center',
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
  stepInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepInnerDotActive: {
    backgroundColor: colors.primary,
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
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
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

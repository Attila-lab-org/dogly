/**
 * Behavior processing — polling GET /v1/behavior/events/{id}.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, ScreenContainer } from '@/components';
import type { ButtonVariant } from '@/components/Button';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import type { BehaviorEventStatus } from '@/contracts/types';
import { PROCESSING_STEP_ORDER, processingStepsFor } from '@/features/core/copy';
import {
  getBehaviorEvent,
  IN_PROGRESS_STATUSES,
  isTerminalBehaviorStatus,
} from '@/features/behavior/api';
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

const TITLE_COLOR = '#1A2B48';
const MUTED_COLOR = '#64748B';
const CARD_BORDER = '#EDF2F7';
const PAGE_BG = '#F8FAFC';

function StatePage({
  icon,
  iconBg,
  iconColor,
  title,
  message,
  primaryTitle,
  onPrimary,
  primaryVariant = 'danger',
  secondaryTitle = 'Torna alla Home',
  onSecondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  message: string;
  primaryTitle: string;
  onPrimary: () => void;
  primaryVariant?: ButtonVariant;
  secondaryTitle?: string;
  onSecondary: () => void;
}) {
  return (
    <View style={styles.statePage}>
      <View style={[styles.stateIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={36} color={iconColor} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      <Button
        title={primaryTitle}
        variant={primaryVariant}
        onPress={onPrimary}
        style={styles.stateButton}
      />
      <Button
        title={secondaryTitle}
        variant="outline"
        onPress={onSecondary}
        style={styles.stateButton}
      />
    </View>
  );
}

export default function BehaviorProcessingScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const useApi =
    isApiConfigured() &&
    Boolean(userId) &&
    isPersistedId(eventId);
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

  const status: BehaviorEventStatus | undefined = query.data?.status;

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

  const goHome = () => router.replace('/(tabs)/home');
  const retryCapture = () => router.replace('/behavior/capture');

  if (useApi && query.isError) {
    return (
      <ScreenContainer style={styles.screen}>
        <ErrorState
          title="Non riesco ad aprire l’analisi"
          message="Controlla la connessione e riprova. Se l’elaborazione è partita, ritroverai il risultato nel Diario."
          onRetry={() => void query.refetch()}
        />
        <Button title="Torna alla Home" variant="danger" onPress={goHome} />
      </ScreenContainer>
    );
  }

  if (!useApi) {
    return (
      <ScreenContainer style={styles.screen}>
        <ErrorState
          title="Analisi non trovata"
          message="Non riesco a trovare questa analisi. Torna alla Home e riprova."
        />
        <Button title="Torna alla Home" variant="danger" onPress={goHome} />
      </ScreenContainer>
    );
  }

  if (status === 'DRAFT' || status === 'UPLOADING') {
    return (
      <ScreenContainer style={styles.screen}>
        <StatePage
          icon="cloud-upload-outline"
          iconBg={colors.tealSoft}
          iconColor={colors.teal}
          title="Sto completando l’invio"
          message="Conserva la connessione per qualche momento. Il video rimane sul telefono finché l’invio non è verificato."
          primaryTitle="Torna alla Home"
          primaryVariant="primary"
          onPrimary={goHome}
          secondaryTitle="Registra di nuovo"
          onSecondary={retryCapture}
        />
      </ScreenContainer>
    );
  }

  if (status === 'REJECTED_QUALITY') {
    return (
      <ScreenContainer style={styles.screen}>
        <StatePage
          icon="videocam-off-outline"
          iconBg={colors.coralSoft}
          iconColor={colors.coral}
          title="Il video non è abbastanza chiaro"
          message={`Non riesco a vedere bene ${dog.name}: possibile scarsa luce, movimento sfocato o inquadratura parziale. Questa prova non viene conteggiata: riprova quando vuoi.`}
          primaryTitle="Registra di nuovo"
          onPrimary={retryCapture}
          onSecondary={goHome}
        />
      </ScreenContainer>
    );
  }

  if (status === 'FAILED_TERMINAL') {
    return (
      <ScreenContainer style={styles.screen}>
        <StatePage
          icon="cloud-offline-outline"
          iconBg={colors.coralSoft}
          iconColor={colors.coral}
          title="Qualcosa non ha funzionato"
          message="C'è stato un problema tecnico dall'altra parte. Non è colpa del video: l'analisi non è stata conteggiata e il problema è già stato segnalato."
          primaryTitle="Riprova"
          onPrimary={retryCapture}
          onSecondary={goHome}
        />
      </ScreenContainer>
    );
  }

  if (
    timedOut &&
    useApi &&
    (!status || !isTerminalBehaviorStatus(status))
  ) {
    return (
      <ScreenContainer style={styles.screen}>
        <StatePage
          icon="time-outline"
          iconBg={colors.coralSoft}
          iconColor={colors.coral}
          title="L’analisi sta impiegando troppo"
          message="Sto ancora lavorando in background e ti avviso se il risultato arriva. Questa attesa non viene conteggiata come un’analisi andata a buon fine: puoi riprovare o tornare più tardi dal Diario."
          primaryTitle="Riprova"
          onPrimary={retryCapture}
          onSecondary={goHome}
        />
      </ScreenContainer>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <ScreenContainer style={styles.screen}>
        <StatePage
          icon="close-circle-outline"
          iconBg={colors.surfaceMuted}
          iconColor={MUTED_COLOR}
          title="Analisi annullata"
          message="Questa analisi non è stata completata e non verrà conteggiata."
          primaryTitle="Registra un nuovo video"
          onPrimary={retryCapture}
          onSecondary={goHome}
        />
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
  const progressRatio = finishing
    ? 1
    : Math.min(1, (currentOrder + (isRetrying ? 0 : 0.45)) / Math.max(1, steps.length - 1));

  return (
    <ScreenContainer style={styles.screen} contentStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna alla Home"
          onPress={goHome}
          hitSlop={12}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={TITLE_COLOR} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Analisi in corso
        </Text>
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

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progressRatio * 100)}%` },
          ]}
        />
      </View>

      {isRetrying && (
        <View style={styles.retryBanner}>
          <Ionicons name="refresh" size={16} color={colors.coral} />
          <Text style={styles.retryText}>
            Sto facendo un altro tentativo. Il video è già arrivato e non uso
            un’altra analisi.
          </Text>
        </View>
      )}

      <View style={styles.stepper}>
        {steps.map((step) => {
          const stepOrder = PROCESSING_STEP_ORDER[step.status];
          const done = finishing || (!isRetrying && stepOrder < currentOrder);
          const active = !finishing && !isRetrying && stepOrder === currentOrder;
          return (
            <View
              key={step.id}
              style={[
                styles.stepCard,
                active && styles.stepCardActive,
              ]}
            >
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : active ? (
                  <View style={styles.stepInnerDotActive} />
                ) : (
                  <View style={styles.stepInnerDot} />
                )}
              </View>
              <View style={styles.stepTextWrap}>
                <Text
                  style={[
                    styles.stepTitle,
                    (active || done) && styles.stepTitleActive,
                  ]}
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
  screen: {
    backgroundColor: PAGE_BG,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: TITLE_COLOR,
    marginHorizontal: spacing.sm,
  },
  topSpacer: {
    width: 40,
  },
  heroText: {
    fontSize: 13,
    color: MUTED_COLOR,
    lineHeight: 19,
    marginBottom: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2DAAAB',
  },
  retryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  retryText: {
    flex: 1,
    fontSize: 13,
    color: TITLE_COLOR,
    lineHeight: 18,
  },
  stepper: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...shadows.card,
  },
  stepCardActive: {
    borderColor: '#C7EDEC',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepDotDone: {
    backgroundColor: '#2DAAAB',
  },
  stepDotActive: {
    backgroundColor: colors.tealSoft,
    borderWidth: 2,
    borderColor: '#2DAAAB',
  },
  stepInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepInnerDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2DAAAB',
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: MUTED_COLOR,
  },
  stepTitleActive: {
    color: TITLE_COLOR,
  },
  stepDescription: {
    marginTop: spacing.xxs,
    color: MUTED_COLOR,
    fontSize: 13,
    lineHeight: 18,
  },
  statePage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  stateIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F7',
  },
  stateTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: TITLE_COLOR,
    textAlign: 'center',
  },
  stateText: {
    fontSize: typography.size.md,
    color: MUTED_COLOR,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  stateButton: {
    alignSelf: 'stretch',
  },
});

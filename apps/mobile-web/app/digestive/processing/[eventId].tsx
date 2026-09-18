import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DogIllustration,
  ErrorState,
  ProgressBar,
  ScreenContainer,
} from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  getDigestiveEvent,
  isFailedDigestiveStatus,
  isRetryableDigestiveStatus,
  isTerminalDigestiveStatus,
  updateDigestiveContext,
} from '@/features/digestive/api';
import {
  DigestiveProcessingContextCard,
} from '@/features/digestive/DigestiveProcessingContextCard';
import { digestiveProcessingQuestions } from '@/features/digestive/processingContext';
import { isApiConfigured } from '@/features/auth/env';
import { useSession } from '@/features/auth/SessionProvider';
import { markDigestiveUploadCompletedForEvent } from '@/features/digestive/upload';
import {
  ANALYSIS_POLL_TIMEOUT_MS,
  analysisPollIntervalMs,
} from '@/features/core/processingTimeout';

const STEP_DURATION_MS = 1100;

export default function DigestiveProcessingScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? ''
    : params.eventId ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [skippedContextKeys, setSkippedContextKeys] = useState<string[]>([]);
  const pollStartedAt = useRef(Date.now());
  const statusRef = useRef<string | undefined>(undefined);
  const useApi = isApiConfigured() && !usingMockGate && Boolean(eventId);

  const query = useQuery({
    queryKey: ['digestive-event', eventId],
    queryFn: () => getDigestiveEvent(eventId),
    enabled: useApi,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || isTerminalDigestiveStatus(status)) return false;
      if (Date.now() - pollStartedAt.current >= ANALYSIS_POLL_TIMEOUT_MS) {
        return false;
      }
      return analysisPollIntervalMs(q.state.dataUpdateCount);
    },
  });
  const contextMutation = useMutation({
    mutationFn: ({
      key,
      value,
    }: {
      key: 'vomiting_today' | 'appetite_reduced' | 'unusual_food_48h';
      value: boolean;
    }) => updateDigestiveContext(eventId, { [key]: value }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['digestive-event', eventId], updated);
    },
  });

  const steps = useMemo(
    () => [
      'Preparo la foto',
      'Osservo forma e colore',
      `Confronto con il solito di ${dog.name}`,
    ],
    [dog.name],
  );
  const contextQuestions = useMemo(
    () => digestiveProcessingQuestions(dog.name),
    [dog.name],
  );
  const answeredContextKeys = new Set(
    query.data?.context_answered_keys ?? [],
  );
  const contextQuestion = contextQuestions.find(
    (item) =>
      !answeredContextKeys.has(item.key) &&
      !skippedContextKeys.includes(item.key),
  );

  useEffect(() => {
    if (!eventId) return undefined;
    if (stepIndex >= steps.length) {
      if (!useApi) router.replace(`/digestive/result/${eventId}`);
      return undefined;
    }
    const timer = setTimeout(
      () => setStepIndex((current) => current + 1),
      STEP_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [useApi, eventId, router, stepIndex, steps.length]);

  statusRef.current = query.data?.status;

  useEffect(() => {
    if (!useApi) return;
    const timer = setTimeout(() => {
      const status = statusRef.current;
      if (!status || !isTerminalDigestiveStatus(status)) {
        setTimedOut(true);
      }
    }, ANALYSIS_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [useApi, eventId]);

  useEffect(() => {
    if (!useApi || !query.data) return;
    if (
      query.data.status === 'COMPLETED' ||
      query.data.status === 'INSUFFICIENT_IMAGE' ||
      query.data.status === 'REJECTED_QUALITY'
    ) {
      markDigestiveUploadCompletedForEvent(query.data.id);
      router.replace(`/digestive/result/${query.data.id}`);
    }
  }, [useApi, query.data, router]);

  if (!eventId && !usingMockGate) {
    return (
      <ScreenContainer style={styles.screen}>
        <ErrorState
          title="Analisi non valida"
          message="Manca l’identificativo dell’analisi. Torna indietro e riprova."
        />
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </ScreenContainer>
    );
  }

  if (useApi && query.isError) {
    return (
      <ScreenContainer style={styles.screen}>
        <ErrorState
          title="Analisi non trovata"
          message="Non riesco a trovare questa analisi. Torna indietro e riprova."
        />
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </ScreenContainer>
    );
  }

  if (useApi && query.data && isFailedDigestiveStatus(query.data.status)) {
    return (
      <ScreenContainer style={styles.screen}>
        <View style={styles.failedPage}>
          <View style={styles.failedIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={colors.danger}
            />
          </View>
          <Text style={styles.failedTitle}>Qualcosa non ha funzionato</Text>
          <Text style={styles.failedText}>
            C'è stato un problema tecnico dall'altra parte. Non è colpa della
            foto: l'analisi non è stata conteggiata.
          </Text>
          <Button
            title="Riprova"
            onPress={() => router.replace('/digestive/capture')}
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
    useApi &&
    query.data &&
    isRetryableDigestiveStatus(query.data.status)
  ) {
    // FAILED_RETRYABLE: the platform is retrying with backoff. Show a retry
    // UI so the owner can re-submit immediately instead of waiting.
    return (
      <ScreenContainer style={styles.screen}>
        <View style={styles.failedPage}>
          <View style={[styles.failedIcon, styles.failedIconWarning]}>
            <Ionicons
              name="refresh-outline"
              size={36}
              color={colors.warning}
            />
          </View>
          <Text style={styles.failedTitle}>Riprovo tra un momento</Text>
          <Text style={styles.failedText}>
            L'analisi non è partita al primo tentativo, ma ci sto riprovando in
            background. Non è colpa della foto: non viene conteggiata. Puoi
            aspettare o riprovare adesso.
          </Text>
          <Button
            title="Riprova adesso"
            onPress={() => router.replace('/digestive/capture')}
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
    (!query.data?.status || !isTerminalDigestiveStatus(query.data.status))
  ) {
    return (
      <ScreenContainer style={styles.screen}>
        <View style={styles.failedPage}>
          <View style={[styles.failedIcon, styles.failedIconWarning]}>
            <Ionicons name="time-outline" size={36} color={colors.warning} />
          </View>
          <Text style={styles.failedTitle}>L’analisi sta impiegando troppo</Text>
          <Text style={styles.failedText}>
            Sto ancora lavorando in background. Questa attesa non viene
            conteggiata come un’analisi andata a buon fine: puoi riprovare o
            tornare più tardi dal Diario.
          </Text>
          <Button
            title="Riprova"
            onPress={() => router.replace('/digestive/capture')}
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

  const visibleStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isUploading = useApi && query.data?.status === 'UPLOADING';
  const progress = Math.min(1, (stepIndex + 1) / steps.length);

  return (
    <ScreenContainer
      style={styles.screen}
      scroll
      contentStyle={styles.content}
    >
      <View style={styles.visual}>
        <View style={styles.softCircle}>
          <Ionicons name="leaf-outline" size={42} color={colors.teal} />
        </View>
        <View style={styles.puppyBadge}>
          <DogIllustration mood="thinking" size={96} />
        </View>
      </View>

      <Text style={styles.title}>Sto valutando la salute digestiva...</Text>
      <Text style={styles.currentStep}>
        {isUploading ? 'La durata dipende dalla connessione' : visibleStep}
      </Text>

      <ProgressBar
        progress={progress}
        tone="accent"
        height={10}
        style={styles.progress}
      />

      <View style={styles.stepList}>
        {steps.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View
              style={[
                styles.stepIcon,
                index <= stepIndex && styles.stepIconActive,
              ]}
            >
              {index < stepIndex ? (
                <Ionicons
                  name="checkmark"
                  size={15}
                  color={colors.textOnPrimary}
                />
              ) : (
                <View
                  style={[
                    styles.stepDot,
                    index === stepIndex && styles.stepDotActive,
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.stepText,
                index <= stepIndex && styles.stepTextActive,
              ]}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>

      {useApi && contextQuestion ? (
        <DigestiveProcessingContextCard
          question={contextQuestion}
          pending={contextMutation.isPending}
          error={contextMutation.isError}
          onAnswer={(value) =>
            contextMutation.mutate({ key: contextQuestion.key, value })
          }
          onSkip={() =>
            setSkippedContextKeys((current) => [
              ...current,
              contextQuestion.key,
            ])
          }
        />
      ) : null}

      <View style={styles.waitCard}>
        <Ionicons name="notifications-outline" size={18} color={colors.teal} />
        <Text style={styles.wait}>
          Puoi anche chiudere: ti avviso quando è pronta.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  visual: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  softCircle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puppyBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  title: {
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    lineHeight: typography.size.xl * typography.lineHeight.tight,
  },
  currentStep: {
    minHeight: 24,
    marginTop: spacing.sm,
    color: '#64748B',
    fontSize: typography.size.md,
    textAlign: 'center',
  },
  progress: {
    width: '100%',
    maxWidth: 320,
    marginTop: spacing.xl,
    backgroundColor: '#E2E8F0',
  },
  stepList: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  stepRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepIconActive: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
  stepDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.textOnPrimary,
  },
  stepText: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
  },
  stepTextActive: {
    color: '#1A2B48',
    fontWeight: typography.weight.semibold,
  },
  waitCard: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  wait: {
    color: '#64748B',
    fontSize: typography.size.xs,
    flex: 1,
  },
  failedPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  failedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  failedIconWarning: {
    backgroundColor: colors.warningSoft,
  },
  failedTitle: {
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  failedText: {
    color: '#64748B',
    fontSize: typography.size.md,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  DogIllustration,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  getDigestiveEvent,
  isFailedDigestiveStatus,
  isTerminalDigestiveStatus,
} from '@/features/digestive/api';
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
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
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

  const steps = useMemo(
    () => [
      'Preparo la foto',
      'Osservo forma e colore',
      `Confronto con il solito di ${dog.name}`,
    ],
    [dog.name],
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
      <ScreenContainer>
        <ErrorState
          title="Analisi non valida"
          message="Manca l’identificativo dell’analisi. Torna indietro e riprova."
        />
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/rocky')}
        />
      </ScreenContainer>
    );
  }

  if (useApi && query.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Analisi non trovata"
          message="Non riesco a trovare questa analisi. Torna indietro e riprova."
        />
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/rocky')}
        />
      </ScreenContainer>
    );
  }

  if (useApi && query.data && isFailedDigestiveStatus(query.data.status)) {
    return (
      <ScreenContainer>
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
            onPress={() => router.replace('/(tabs)/rocky')}
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
      <ScreenContainer>
        <View style={styles.failedPage}>
          <View style={styles.failedIcon}>
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
            onPress={() => router.replace('/(tabs)/rocky')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const visibleStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isUploading = useApi && query.data?.status === 'UPLOADING';

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.visual}>
        <DogIllustration mood="thinking" size={210} />
      </View>

      <Text style={styles.title}>
        {isUploading
          ? 'Sto caricando la foto in modo sicuro'
          : `Sto analizzando la foto di ${dog.name}`}
      </Text>
      <Text style={styles.currentStep}>
        {isUploading ? 'La durata dipende dalla connessione' : visibleStep}
      </Text>

      <View style={styles.stepList}>
        {steps.map((step, index) => (
          <View
            key={step}
            style={styles.stepRow}
          >
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

      <View style={styles.waitCard}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.wait}>
          Puoi anche chiudere: ti avviso quando è pronta.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  visual: {
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  currentStep: {
    minHeight: 24,
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
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
    borderColor: colors.accent,
    backgroundColor: colors.accent,
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
    color: colors.text,
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
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  wait: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
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
  failedTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  failedText: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
});

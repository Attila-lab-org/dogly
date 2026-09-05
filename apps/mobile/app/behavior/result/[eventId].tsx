/**
 * Behavior result — GET evento reale + POST feedback.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import type { FeedbackValue } from '@/contracts/types';
import { BehaviorResultView } from '@/features/core/components';
import { saveBehaviorFeedback } from '@/features/core/feedback';
import { behaviorResultsMock } from '@/mocks/core';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useCheckIn } from '@/features/checkin/store';
import {
  getBehaviorEvent,
  mapApiEventToResult,
} from '@/features/behavior/api';
import { isApiConfigured } from '@/features/auth/env';

export default function BehaviorResultScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { analysisContext } = useCheckIn();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const useApi =
    isApiConfigured() && Boolean(eventId) && !eventId?.startsWith('evt-');

  const query = useQuery({
    queryKey: ['behavior-event', eventId],
    queryFn: () => getBehaviorEvent(eventId!),
    enabled: useApi,
  });

  const result = useApi
    ? query.data
      ? mapApiEventToResult(query.data)
      : undefined
    : eventId
      ? behaviorResultsMock[eventId]
      : undefined;

  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    result?.feedback ?? null,
  );
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (result?.feedback) setFeedback(result.feedback);
  }, [result?.feedback]);

  const notCompleted = result !== undefined && result.status !== 'COMPLETED';
  useEffect(() => {
    if (notCompleted && result) {
      router.replace(`/behavior/processing/${result.eventId}`);
    }
  }, [notCompleted, result, router]);

  if (useApi && query.isLoading) {
    return (
      <ScreenContainer>
        <ErrorState title="Caricamento" message="Sto aprendo il risultato…" />
      </ScreenContainer>
    );
  }

  if (!result) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Risultato non trovato"
          message="Non riesco ad aprire questa analisi. Controlla il Diario."
        />
        <Button
          title="Apri il Diario"
          onPress={() => router.replace('/(tabs)/diary')}
        />
      </ScreenContainer>
    );
  }

  if (notCompleted) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Analisi in corso"
          message="Ti porto allo stato dell'analisi…"
        />
      </ScreenContainer>
    );
  }

  const handleFeedback = async (value: FeedbackValue) => {
    setSavingFeedback(true);
    try {
      const saved = await saveBehaviorFeedback(result.eventId, value);
      setFeedback(saved);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <ScreenContainer padded={false}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Risultato</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <BehaviorResultView
          result={result}
          dogName={dog.name}
          feedback={feedback}
          onFeedback={(v) => {
            if (!savingFeedback) void handleFeedback(v);
          }}
          careNote={
            analysisContext?.concern === 'off' ? analysisContext.note : null
          }
        />

        {(result.primary_intent === 'FEAR_INSECURITY' ||
          result.primary_intent === 'DISCOMFORT_AVOIDANCE') && (
          <Text style={styles.safetyNote}>
            Se questi segnali si ripetono o ti preoccupano, considera di
            parlarne con il tuo veterinario o con un educatore cinofilo.
          </Text>
        )}

        <Button
          title="Torna al Diario"
          variant="outline"
          icon={<Ionicons name="book-outline" size={18} color={colors.accent} />}
          onPress={() => router.replace('/(tabs)/diary')}
          style={styles.saveButton}
          testID="back-to-diary"
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  topSpacer: {
    width: 26,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  safetyNote: {
    marginTop: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  saveButton: {
    marginTop: spacing.xl,
  },
});

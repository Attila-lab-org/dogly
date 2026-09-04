/**
 * Behavior result (Spec V1 sez. 6, 6.1) — replica fedele di
 * docs/ux/mockup-result.png con riconciliazioni spec:
 * - pill di confidenza a band (bassa/media/alta), MAI percentuale (O-07);
 * - headline + summary probabilistici ("sembra / probabilmente / possibile");
 * - 3–5 evidence bullet con fonte tipizzata; alternativa quando incerto;
 * - feedback a tre vie one-tap ("Sì, è così / Non credo / Non lo so"),
 *   nessuna penalità per "Non lo so";
 * - ambiguous/insufficient sono risultati validi completati (sez. 6.1).
 * Stati obbligatori (sez. 6): clear, ambiguous, insufficient, safety message
 * (FEAR_INSECURITY/DISCOMFORT con copy prudente).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import type { FeedbackValue } from '@/contracts/types';
import { BehaviorResultView } from '@/features/core/components';
import { behaviorResultsMock, dogMock } from '@/mocks/core';

export default function BehaviorResultScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const result = eventId ? behaviorResultsMock[eventId] : undefined;

  // Feedback one-tap: locale finché non c'è POST /v1/.../feedback (sez. 9)
  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    result?.feedback ?? null,
  );

  // Evento non ancora completato: rimanda alla schermata di processing
  const notCompleted = result !== undefined && result.status !== 'COMPLETED';
  useEffect(() => {
    if (notCompleted && result) {
      router.replace(`/behavior/processing/${result.eventId}`);
    }
  }, [notCompleted, result, router]);

  if (!result) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Risultato non trovato"
          message="Non riesco ad aprire questa analisi. Controlla il Diario."
        />
        <Button title="Apri il Diario" onPress={() => router.replace('/(tabs)/diary')} />
      </ScreenContainer>
    );
  }

  if (notCompleted) {
    return (
      <ScreenContainer>
        <ErrorState title="Analisi in corso" message="Ti porto allo stato dell'analisi…" />
      </ScreenContainer>
    );
  }

  const isInsufficient =
    result.primary_intent === null || result.primary_intent === 'INSUFFICIENT';

  return (
    <ScreenContainer padded={false}>
      {/* Top bar: back + titolo centrato (mockup) */}
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
          dogName={dogMock.name}
          feedback={feedback}
          onFeedback={setFeedback}
        />

        {/* Safety message (sez. 6): copy prudente, mai diagnostico */}
        {(result.primary_intent === 'FEAR_INSECURITY' ||
          result.primary_intent === 'DISCOMFORT_AVOIDANCE') && (
          <Text style={styles.safetyNote}>
            Se questi segnali si ripetono o ti preoccupano, considera di
            parlarne con il tuo veterinario o con un educatore cinofilo.
          </Text>
        )}

        {/* Azione finale: Salva nel diario (outline teal, mockup) */}
        <Button
          title={isInsufficient ? 'Vai al Diario' : 'Salva nel diario'}
          variant="outline"
          icon={<Ionicons name="bookmark-outline" size={18} color={colors.accent} />}
          onPress={() => router.replace('/(tabs)/diary')}
          style={styles.saveButton}
          testID="save-to-diary"
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

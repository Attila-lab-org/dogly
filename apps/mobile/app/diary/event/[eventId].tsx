/**
 * Dettaglio episodio del Diario (Spec V1 sez. 5.1, 6).
 * - Evento comportamentale: contratto risultato 6.1 completo (riusa
 *   BehaviorResultView), incluso feedback a tre vie.
 * - Evento digestivo: riepilogo e link alla schermata dedicata (F2).
 * - Media cancellato dalla retention: avviso esplicito (stato "deleted media").
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { FeedbackValue } from '@/contracts/types';
import { BehaviorResultView, SectionHeader } from '@/features/core/components';
import { saveBehaviorFeedback } from '@/features/core/feedback';
import { useDogProfile } from '@/features/core/useDogProfile';
import { behaviorResultsMock, diaryEntriesMock } from '@/mocks/core';

export default function DiaryEventScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const entry = diaryEntriesMock.find((e) => e.id === eventId);
  const behaviorResult = entry ? behaviorResultsMock[entry.refId] : undefined;

  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    behaviorResult?.feedback ?? null,
  );

  if (!entry) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Episodio non trovato"
          message="Non riesco ad aprire questo episodio del diario."
        />
        <Button title="Torna al Diario" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const occurredLabel = new Date(entry.occurredAt).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleFeedback = (value: FeedbackValue) => {
    if (!behaviorResult) return;
    setFeedback(saveBehaviorFeedback(behaviorResult.eventId, value));
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
        <Text style={styles.topTitle}>Episodio</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.date}>{occurredLabel}</Text>

        {entry.mediaDeleted && (
          <View style={styles.deletedBanner}>
            <Ionicons name="trash-bin-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.deletedText}>
              Il video di questo episodio è stato eliminato secondo le tue
              impostazioni di privacy. Il risultato resta disponibile.
            </Text>
          </View>
        )}

        {entry.domain === 'BEHAVIOR' && behaviorResult ? (
          <BehaviorResultView
            result={behaviorResult}
            dogName={dog.name}
            feedback={feedback}
            onFeedback={handleFeedback}
          />
        ) : (
          /* Evento digestivo: il dettaglio completo vive nel flusso F2 */
          <Card>
            <SectionHeader
              title={entry.title}
              icon={<Ionicons name="leaf-outline" size={18} color={colors.accent} />}
            />
            {entry.subtitle ? (
              <Text style={styles.digestiveSubtitle}>{entry.subtitle}</Text>
            ) : null}
            <Button
              title="Apri il controllo digestione"
              variant="outline"
              onPress={() => router.push(`/digestive/result/${entry.refId}`)}
              style={styles.digestiveButton}
            />
          </Card>
        )}
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
  date: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginBottom: spacing.md,
  },
  deletedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  deletedText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  digestiveSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  digestiveButton: {
    marginTop: spacing.sm,
  },
});

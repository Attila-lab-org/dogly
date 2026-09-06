import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  saveLifestyleProfile,
  useLifestyle,
  type LifestylePatch,
} from '@/features/lifestyle/api';
import {
  LIFESTYLE_ACTIVITY_LABELS,
  LIFESTYLE_ENRICHMENT_LABELS,
  LIFESTYLE_SLEEP_LABELS,
  LIFESTYLE_SOCIAL_LABELS,
  LIFESTYLE_TIME_ALONE_LABELS,
} from '@/features/lifestyle/types';

export default function LifestyleScreen() {
  const router = useRouter();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const lifestyle = useLifestyle(dogId);
  const [draft, setDraft] = useState<LifestylePatch>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lifestyle.profile) return;
    setDraft({
      activity: lifestyle.profile.activity,
      sleep: lifestyle.profile.sleep,
      timeAlone: lifestyle.profile.timeAlone,
      social: lifestyle.profile.social,
      enrichment: lifestyle.profile.enrichment,
    });
  }, [lifestyle.profile]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveLifestyleProfile(dogId, draft, lifestyle.mockGate);
      await lifestyle.refetch();
      router.back();
    } catch {
      setError('Non sono riuscito a salvare. Riprova tra poco.');
    } finally {
      setSaving(false);
    }
  };

  if (lifestyle.loading) {
    return (
      <ScreenContainer>
        <ErrorState title="Un momento" message="Sto aprendo le sue abitudini…" />
      </ScreenContainer>
    );
  }

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
        <Text style={styles.topTitle}>Routine e abitudini</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Aiutami a conoscerlo meglio</Text>
        <Text style={styles.subtitle}>
          Scegli solo quello che sai. Puoi cambiare queste risposte quando vuoi.
        </Text>

        <ChoiceCard
          title="Com’è di solito la sua giornata?"
          value={draft.activity}
          options={LIFESTYLE_ACTIVITY_LABELS}
          onChange={(activity) => setDraft((current) => ({ ...current, activity }))}
        />
        <ChoiceCard
          title="Come dorme di solito?"
          value={draft.sleep}
          options={LIFESTYLE_SLEEP_LABELS}
          onChange={(sleep) => setDraft((current) => ({ ...current, sleep }))}
        />
        <ChoiceCard
          title="Quanto tempo resta da solo?"
          value={draft.timeAlone}
          options={LIFESTYLE_TIME_ALONE_LABELS}
          onChange={(timeAlone) =>
            setDraft((current) => ({ ...current, timeAlone }))
          }
        />
        <ChoiceCard
          title="Con chi ama stare?"
          value={draft.social}
          options={LIFESTYLE_SOCIAL_LABELS}
          onChange={(social) => setDraft((current) => ({ ...current, social }))}
        />
        <ChoiceCard
          title="Cosa lo coinvolge di più?"
          value={draft.enrichment}
          options={LIFESTYLE_ENRICHMENT_LABELS}
          onChange={(enrichment) =>
            setDraft((current) => ({ ...current, enrichment }))
          }
        />

        {error || lifestyle.error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error ?? 'Non riesco a caricare le abitudini. Puoi riprovare.'}
          </Text>
        ) : null}
        <Button title="Salva" loading={saving} onPress={() => void save()} />
      </ScrollView>
    </ScreenContainer>
  );
}

function ChoiceCard<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T | null | undefined;
  options: Record<T, string>;
  onChange: (value: T | null) => void;
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.options}>
        {(Object.entries(options) as [T, string][]).map(([option, label]) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(selected ? null : option)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: value == null }}
          onPress={() => onChange(null)}
          style={[styles.option, value == null && styles.optionSelected]}
        >
          <Text style={[styles.optionText, value == null && styles.optionTextSelected]}>
            Non so
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topBar: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  topSpacer: { width: 26 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.sm,
  },
  card: { gap: spacing.md },
  cardTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  optionTextSelected: { color: colors.accent },
  error: {
    color: colors.danger,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});

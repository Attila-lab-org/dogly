import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  DogIllustration,
  ErrorState,
  ScreenContainer,
} from '@/components';
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
import { useDogProfile } from '@/features/core/useDogProfile';

export default function LifestyleScreen() {
  const router = useRouter();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { dog } = useDogProfile();
  const lifestyle = useLifestyle(dogId);
  const [draft, setDraft] = useState<LifestylePatch>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

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
        <View style={styles.intro}>
          <DogIllustration mood="welcome" size={170} />
          <Text style={styles.title}>Conosciamo meglio {dog.name}</Text>
        <Text style={styles.subtitle}>
            Scegli solo ciò che ti va di condividere. Puoi modificare tutto
            quando vuoi.
        </Text>
        </View>

        <ChoiceCard
          sectionKey="activity"
          icon="walk-outline"
          open={openSection === 'activity'}
          onToggle={() =>
            setOpenSection((current) => (current === 'activity' ? null : 'activity'))
          }
          title="Com’è di solito la sua giornata?"
          value={draft.activity}
          options={LIFESTYLE_ACTIVITY_LABELS}
          onChange={(activity) => setDraft((current) => ({ ...current, activity }))}
        />
        <ChoiceCard
          sectionKey="sleep"
          icon="moon-outline"
          open={openSection === 'sleep'}
          onToggle={() =>
            setOpenSection((current) => (current === 'sleep' ? null : 'sleep'))
          }
          title="Come dorme di solito?"
          value={draft.sleep}
          options={LIFESTYLE_SLEEP_LABELS}
          onChange={(sleep) => setDraft((current) => ({ ...current, sleep }))}
        />
        <ChoiceCard
          sectionKey="alone"
          icon="time-outline"
          open={openSection === 'alone'}
          onToggle={() =>
            setOpenSection((current) => (current === 'alone' ? null : 'alone'))
          }
          title="Quanto tempo resta da solo?"
          value={draft.timeAlone}
          options={LIFESTYLE_TIME_ALONE_LABELS}
          onChange={(timeAlone) =>
            setDraft((current) => ({ ...current, timeAlone }))
          }
        />
        <ChoiceCard
          sectionKey="social"
          icon="people-outline"
          open={openSection === 'social'}
          onToggle={() =>
            setOpenSection((current) => (current === 'social' ? null : 'social'))
          }
          title="Con chi ama stare?"
          value={draft.social}
          options={LIFESTYLE_SOCIAL_LABELS}
          onChange={(social) => setDraft((current) => ({ ...current, social }))}
        />
        <ChoiceCard
          sectionKey="enrichment"
          icon="tennisball-outline"
          open={openSection === 'enrichment'}
          onToggle={() =>
            setOpenSection((current) =>
              current === 'enrichment' ? null : 'enrichment',
            )
          }
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
        <Button title="Continua" loading={saving} onPress={() => void save()} />
      </ScrollView>
    </ScreenContainer>
  );
}

function ChoiceCard<T extends string>({
  icon,
  open,
  onToggle,
  title,
  value,
  options,
  onChange,
}: {
  sectionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  open: boolean;
  onToggle: () => void;
  title: string;
  value: T | null | undefined;
  options: Record<T, string>;
  onChange: (value: T | null) => void;
}) {
  const selectedLabel =
    value == null ? 'Opzionale' : (options[value] ?? 'Selezionato');
  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.cardHeading}
      >
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardValue}>{selectedLabel}</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-forward'}
          size={19}
          color={colors.textMuted}
        />
      </Pressable>
      {open ? <View style={styles.options}>
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
      </View> : null}
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  intro: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  card: { gap: spacing.md },
  cardHeading: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  cardValue: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
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

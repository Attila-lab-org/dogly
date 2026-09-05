import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ScreenContainer } from '@/components';
import {
  hydrateNotificationPreferences,
  setNotificationPreference,
  useNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/store';
import { StackScreenHeader } from '@/features/secondary/components';
import { FREQUENCY_OPTIONS } from '@/features/checkin/copy';
import { setCheckInFrequency, useCheckIn } from '@/features/checkin/store';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const OPTIONS: Array<{
  key: keyof NotificationPreferences;
  title: string;
  description: string;
  /** true = la preferenza viene salvata, ma nessun invio la usa ancora */
  comingSoon?: boolean;
}> = [
  {
    key: 'careReminders',
    title: 'Agenda e appuntamenti',
    description: 'Vaccini, visite e altre scadenze.',
  },
  {
    key: 'resultReady',
    title: 'Risultati pronti',
    description: 'Quando termina una nuova analisi.',
    comingSoon: true,
  },
  {
    key: 'checkIn',
    title: 'Come sta oggi',
    description: 'Promemoria occasionali, senza messaggi ripetitivi.',
  },
  {
    key: 'newPattern',
    title: 'Nuove abitudini',
    description: 'Quando emerge qualcosa di utile.',
    comingSoon: true,
  },
  {
    key: 'digestiveTrend',
    title: 'Cambiamenti digestivi',
    description: 'Quando notiamo una variazione importante.',
    comingSoon: true,
  },
  {
    key: 'weeklySummary',
    title: 'Riepilogo settimanale',
    description: 'Un riepilogo della settimana.',
    comingSoon: true,
  },
];

export default function NotificationSettingsScreen() {
  const preferences = useNotificationPreferences();
  const { prefs } = useCheckIn();

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Preferenze notifiche" />
      <Text style={styles.intro}>
        Le modifiche vengono salvate subito.
      </Text>

      <Text style={styles.section}>Come sta oggi</Text>
      <View style={styles.frequencyRow}>
        {FREQUENCY_OPTIONS.map((option) => {
          const selected = prefs.frequency === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCheckInFrequency(option.id)}
              style={[
                styles.frequencyChip,
                selected && styles.frequencyChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.frequencyText,
                  selected && styles.frequencyTextSelected,
                ]}
              >
                {option.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Cosa ricevere</Text>
      <Card style={styles.card}>
        {OPTIONS.map((option, index) => (
          <View
            key={option.key}
            style={[styles.row, index > 0 && styles.divider]}
          >
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{option.title}</Text>
                {option.comingSoon ? (
                  <Chip label="In arrivo" tone="neutral" />
                ) : null}
              </View>
              <Text style={styles.description}>{option.description}</Text>
              {option.comingSoon ? (
                <Text style={styles.comingSoonNote}>
                  La preferenza viene salvata ora; l’invio arriva con una
                  prossima versione.
                </Text>
              ) : null}
            </View>
            <Switch
              value={preferences[option.key]}
              onValueChange={(value) =>
                setNotificationPreference(option.key, value)
              }
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={
                preferences[option.key] ? colors.accent : colors.textMuted
              }
              accessibilityLabel={option.title}
            />
          </View>
        ))}
      </Card>

      <View style={styles.note}>
        <Ionicons
          name="phone-portrait-outline"
          size={18}
          color={colors.primary}
        />
        <Text style={styles.noteText}>
          Il telefono chiede il permesso solo quando attivi il primo
          promemoria.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  section: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  frequencyChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  frequencyChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  frequencyText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  frequencyTextSelected: {
    color: colors.textOnPrimary,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  comingSoonNote: {
    marginTop: spacing.xxs,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  description: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  noteText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

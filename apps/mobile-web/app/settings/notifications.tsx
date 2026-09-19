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
import { colors, shadows, spacing, typography } from '@/theme/tokens';

const OPTIONS: Array<{
  key: keyof NotificationPreferences;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  /** true = la preferenza viene salvata, ma nessun invio la usa ancora */
  comingSoon?: boolean;
}> = [
  {
    key: 'careReminders',
    icon: 'calendar-outline',
    iconBg: '#E0F2FE',
    iconColor: '#0284C7',
    title: 'Agenda e appuntamenti',
    description: 'Vaccini, visite e altre scadenze.',
  },
  {
    key: 'resultReady',
    icon: 'checkmark-circle-outline',
    iconBg: colors.tealSoft,
    iconColor: colors.teal,
    title: 'Risultati pronti',
    description: 'Quando termina una nuova analisi.',
    comingSoon: true,
  },
  {
    key: 'checkIn',
    icon: 'heart-outline',
    iconBg: '#E0F2FE',
    iconColor: '#0284C7',
    title: 'Come sta oggi',
    description: 'Promemoria occasionali, senza messaggi ripetitivi.',
  },
  {
    key: 'newPattern',
    icon: 'sparkles-outline',
    iconBg: colors.tealSoft,
    iconColor: colors.teal,
    title: 'Nuove abitudini',
    description: 'Quando emerge qualcosa di utile.',
    comingSoon: true,
  },
  {
    key: 'digestiveTrend',
    icon: 'nutrition-outline',
    iconBg: '#E0F2FE',
    iconColor: '#0284C7',
    title: 'Cambiamenti digestivi',
    description: 'Quando notiamo una variazione importante.',
    comingSoon: true,
  },
  {
    key: 'weeklySummary',
    icon: 'newspaper-outline',
    iconBg: colors.tealSoft,
    iconColor: colors.teal,
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
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Preferenze notifiche" />
      <Text style={styles.intro}>
        Le modifiche vengono salvate subito.
      </Text>

      <Text style={styles.section}>Come sta oggi</Text>
      <Card style={styles.frequencyCard}>
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
      </Card>

      <Text style={styles.section}>Cosa ricevere</Text>
      <Card noPadding style={styles.group}>
        {OPTIONS.map((option, index) => (
          <View
            key={option.key}
            style={[styles.row, index > 0 && styles.divider]}
          >
            <View style={[styles.iconWrap, { backgroundColor: option.iconBg }]}>
              <Ionicons
                name={option.icon}
                size={18}
                color={option.iconColor}
              />
            </View>
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{option.title}</Text>
              </View>
              <Text style={styles.description}>{option.description}</Text>
            </View>
            {option.comingSoon ? (
              <Chip label="In arrivo" tone="neutral" />
            ) : (
            <Switch
              value={preferences[option.key]}
              onValueChange={(value) =>
                setNotificationPreference(option.key, value)
              }
              trackColor={{ false: colors.border, true: colors.teal }}
              thumbColor="#FFFFFF"
              accessibilityLabel={option.title}
            />
            )}
          </View>
        ))}
      </Card>

      <View style={styles.note}>
        <View style={[styles.iconWrap, { backgroundColor: '#E0F2FE' }]}>
          <Ionicons
            name="phone-portrait-outline"
            size={18}
            color="#0284C7"
          />
        </View>
        <Text style={styles.noteText}>
          Il telefono chiede il permesso solo quando attivi il primo
          promemoria.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  intro: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  section: {
    marginBottom: spacing.sm,
    color: '#1A2B48',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  frequencyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  frequencyChip: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: colors.surfaceMuted,
  },
  frequencyChipSelected: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  frequencyText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  frequencyTextSelected: {
    color: colors.teal,
  },
  group: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  comingSoonNote: {
    marginTop: spacing.xxs,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
  title: {
    color: '#1A2B48',
    fontSize: 15,
    fontWeight: typography.weight.medium,
  },
  description: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  noteText: {
    flex: 1,
    color: '#1A2B48',
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

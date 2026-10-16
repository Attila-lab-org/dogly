import React, { useEffect } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, ScreenContainer } from '@/components';
import {
  hydrateNotificationPreferences,
  setNotificationPreference,
  useNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/store';
import { StackScreenHeader } from '@/features/secondary/components';
import { FREQUENCY_OPTIONS } from '@/features/checkin/copy';
import {
  setCheckInFrequency,
  setSmartReminders,
  useCheckIn,
} from '@/features/checkin/store';
import { syncCareReminders } from '@/features/care/store';
import { useDogProfile } from '@/features/core/useDogProfile';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import { SpringPress } from '@/components/pressSpring';

const OPTIONS: Array<{
  key: keyof NotificationPreferences;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
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
    key: 'checkIn',
    icon: 'heart-outline',
    iconBg: '#E0F2FE',
    iconColor: '#0284C7',
    title: 'Promemoria check-in',
    description: 'Chiedimi occasionalmente come sta il mio cane.',
  },
];

export default function NotificationSettingsScreen() {
  const preferences = useNotificationPreferences();
  const { prefs } = useCheckIn();
  const { dog } = useDogProfile();

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Preferenze notifiche" />
      <Text style={styles.intro}>
        Le modifiche vengono salvate subito.
      </Text>

      <Text style={styles.section}>Frequenza del check-in</Text>
      <Card style={styles.frequencyCard}>
        <View style={styles.frequencyRow}>
          {FREQUENCY_OPTIONS.map((option) => {
            const selected = prefs.frequency === option.id;
            return (
              <SpringPress
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={option.title}
                accessibilityHint={option.description}
                accessibilityState={{ selected }}
                onPress={() => setCheckInFrequency(option.id)}
                style={styles.frequencyOption}
                pressableStyle={[
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
              </SpringPress>
            );
          })}
        </View>
        <Text style={styles.frequencyDescription} accessibilityLiveRegion="polite">
          {FREQUENCY_OPTIONS.find((option) => option.id === prefs.frequency)?.description}
        </Text>
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
            <Switch
              value={option.key === 'checkIn' ? prefs.smartReminders : preferences[option.key]}
              onValueChange={async (value) => {
                const saved = await setNotificationPreference(option.key, value);
                if (!saved) {
                  Alert.alert('Preferenza non salvata', 'Controlla la connessione e riprova.');
                  return;
                }
                if (option.key === 'checkIn') setSmartReminders(value);
                if (option.key === 'careReminders' && dog.id) {
                  void syncCareReminders(dog.id, dog.name);
                }
              }}
              trackColor={{ false: colors.border, true: colors.teal }}
              thumbColor="#FFFFFF"
              accessibilityLabel={option.title}
              />
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
          Il check-in compare dentro DOGly. Il permesso del telefono riguarda
          solo i promemoria dell’agenda.
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
  frequencyOption: {
    flex: 1,
    minWidth: 0,
  },
  frequencyChip: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
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
    textAlign: 'center',
  },
  frequencyTextSelected: {
    color: colors.teal,
  },
  frequencyDescription: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
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

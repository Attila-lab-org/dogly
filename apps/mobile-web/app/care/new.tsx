import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { AgendaDatePicker } from '@/features/care/AgendaDatePicker';
import {
  combineLocalDateTime,
  localDateKey,
  tomorrowAt,
} from '@/features/care/date';
import { addCareEvent } from '@/features/care/store';
import { careNotificationsSupported } from '@/features/care/notifications';
import {
  CARE_EVENT_TYPES,
  CARE_TYPE_META,
  type CareEventType,
} from '@/features/care/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { useNotificationPreferences } from '@/features/notifications/store';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const TIME_OPTIONS = [9, 10, 15, 18] as const;

export default function NewCareEventScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const notificationPreferences = useNotificationPreferences();
  const initialDate = tomorrowAt();
  const [eventType, setEventType] = useState<CareEventType>('VET_VISIT');
  const [title, setTitle] = useState(
    CARE_TYPE_META.VET_VISIT.defaultTitle,
  );
  const [date, setDate] = useState(localDateKey(initialDate));
  const [hour, setHour] = useState(10);
  const [allDay, setAllDay] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(
    notificationPreferences.careReminders,
  );
  const [showDetails, setShowDetails] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const chooseType = (nextType: CareEventType) => {
    const previousDefault = CARE_TYPE_META[eventType].defaultTitle;
    setEventType(nextType);
    if (!title.trim() || title === previousDefault) {
      setTitle(CARE_TYPE_META[nextType].defaultTitle);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Manca il titolo', 'Scrivi cosa vuoi ricordare.');
      return;
    }

    setSaving(true);
    try {
      const result = await addCareEvent({
        dogId: dog.id,
        dogName: dog.name,
        eventType,
        title,
        scheduledAt: combineLocalDateTime(date, allDay ? 9 : hour),
        allDay,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome',
        location,
        notes,
        reminderEnabled,
        reminderMinutesBefore: 1440,
      });
      if (
        reminderEnabled &&
        !result.reminderScheduled &&
        Platform.OS !== 'web' &&
        careNotificationsSupported()
      ) {
        Alert.alert(
          'Appuntamento salvato',
          'Il promemoria non è attivo. Puoi consentire le notifiche dalle impostazioni del telefono.',
          [
            {
              text: 'Va bene',
              onPress: () => router.replace('/care' as never),
            },
          ],
        );
      } else {
        router.replace('/care' as never);
      }
    } catch {
      Alert.alert(
        'Non riesco a salvare',
        'Controlla la connessione e riprova.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Nuovo promemoria" />

      <Text style={styles.step}>Cosa vuoi ricordare?</Text>
      <View style={styles.typeGrid}>
        {CARE_EVENT_TYPES.map((type) => {
          const meta = CARE_TYPE_META[type];
          const selected = eventType === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => chooseType(type)}
              style={[
                styles.typeCard,
                selected && styles.typeCardSelected,
              ]}
            >
              <View
                style={[
                  styles.typeIcon,
                  selected && styles.typeIconSelected,
                ]}
              >
                <Ionicons
                  name={meta.icon}
                  size={21}
                  color={selected ? colors.textOnPrimary : colors.primary}
                />
              </View>
              <Text
                style={[
                  styles.typeLabel,
                  selected && styles.typeLabelSelected,
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Titolo</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Es. Richiamo vaccino"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
        style={styles.input}
      />

      <Text style={styles.label}>Quando?</Text>
      <AgendaDatePicker value={date} onChange={setDate} />

      <View style={styles.timeHeader}>
        <Text style={styles.labelInline}>Orario</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAllDay((value) => !value)}
          style={styles.allDayButton}
        >
          <Ionicons
            name={allDay ? 'checkbox' : 'square-outline'}
            size={19}
            color={allDay ? colors.primary : colors.textMuted}
          />
          <Text style={styles.allDayText}>Senza orario</Text>
        </Pressable>
      </View>
      {!allDay ? (
        <View style={styles.timeRow}>
          {TIME_OPTIONS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: hour === option }}
              onPress={() => setHour(option)}
              style={[
                styles.timeChip,
                hour === option && styles.timeChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.timeText,
                  hour === option && styles.timeTextSelected,
                ]}
              >
                {String(option).padStart(2, '0')}:00
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.reminderCard}>
        <View style={styles.reminderIcon}>
          <Ionicons
            name="notifications-outline"
            size={21}
            color={colors.accent}
          />
        </View>
        <View style={styles.reminderCopy}>
          <Text style={styles.reminderTitle}>Avvisami il giorno prima</Text>
          <Text style={styles.reminderDescription}>
            È già attivo, puoi disattivarlo quando vuoi.
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={setReminderEnabled}
          trackColor={{ false: colors.border, true: colors.accentSoft }}
          thumbColor={reminderEnabled ? colors.accent : colors.textMuted}
          accessibilityLabel="Avvisami il giorno prima"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowDetails((value) => !value)}
        style={styles.detailsToggle}
      >
        <Ionicons
          name={showDetails ? 'remove-circle-outline' : 'add-circle-outline'}
          size={20}
          color={colors.primary}
        />
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Nascondi dettagli' : 'Aggiungi luogo o nota'}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={styles.optional}>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Luogo o veterinario (facoltativo)"
            placeholderTextColor={colors.textMuted}
            maxLength={160}
            style={styles.input}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Nota (facoltativa)"
            placeholderTextColor={colors.textMuted}
            maxLength={1000}
            multiline
            style={[styles.input, styles.notes]}
          />
        </View>
      ) : null}

      <Button
        title="Aggiungi all’agenda"
        onPress={save}
        loading={saving}
        style={styles.save}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  step: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  typeCard: {
    width: '31%',
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  typeIconSelected: {
    backgroundColor: colors.primary,
  },
  typeLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: colors.primary,
  },
  label: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  input: {
    minHeight: 54,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  labelInline: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  allDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  allDayText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  timeChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  timeTextSelected: {
    color: colors.textOnPrimary,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  reminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  reminderCopy: {
    flex: 1,
  },
  reminderTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  reminderDescription: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.lg,
  },
  detailsToggleText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  optional: {
    gap: 0,
  },
  notes: {
    minHeight: 96,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  save: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
});

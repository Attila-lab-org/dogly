import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
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
import { colors, shadows, spacing, typography } from '@/theme/tokens';

const TIME_OPTIONS = [9, 10, 15, 18] as const;

const CARE = {
  bg: '#F8FAFC',
  text: '#1A2B48',
  muted: '#64748B',
  border: '#EDF2F7',
  teal: '#2DAAAB',
  tealSoft: '#E0F7F6',
  coral: '#FF8B74',
  peach: '#FFF1EE',
} as const;

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
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Nuovo promemoria" />

      <Text style={styles.step}>Cosa vuoi ricordare?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typeRow}
      >
        {CARE_EVENT_TYPES.map((type) => {
          const meta = CARE_TYPE_META[type];
          const selected = eventType === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => chooseType(type)}
              style={[styles.typeChip, selected && styles.typeChipSelected]}
            >
              <Ionicons
                name={meta.icon}
                size={16}
                color={selected ? colors.textOnPrimary : CARE.teal}
              />
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
      </ScrollView>

      <Text style={styles.label}>Titolo</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Es. Richiamo vaccino"
        placeholderTextColor={CARE.muted}
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
            color={allDay ? CARE.teal : CARE.muted}
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
            color={CARE.teal}
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
          trackColor={{ false: CARE.border, true: CARE.tealSoft }}
          thumbColor={reminderEnabled ? CARE.teal : CARE.muted}
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
          color={CARE.teal}
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
            placeholderTextColor={CARE.muted}
            maxLength={160}
            style={styles.input}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Nota (facoltativa)"
            placeholderTextColor={CARE.muted}
            maxLength={1000}
            multiline
            style={[styles.input, styles.notes]}
          />
        </View>
      ) : null}

      <Button
        title="Aggiungi all’agenda"
        variant="secondary"
        onPress={save}
        loading={saving}
        style={styles.save}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: CARE.bg,
  },
  step: {
    marginBottom: spacing.md,
    color: CARE.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: CARE.border,
    backgroundColor: '#FFFFFF',
  },
  typeChipSelected: {
    borderColor: CARE.teal,
    backgroundColor: CARE.teal,
  },
  typeLabel: {
    color: CARE.text,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
  },
  typeLabelSelected: {
    color: colors.textOnPrimary,
  },
  label: {
    marginBottom: spacing.sm,
    color: CARE.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  input: {
    minHeight: 54,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: CARE.border,
    borderRadius: 16,
    backgroundColor: CARE.bg,
    color: CARE.text,
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
    color: CARE.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  allDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  allDayText: {
    color: CARE.muted,
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
    borderRadius: 9999,
    backgroundColor: CARE.bg,
    borderWidth: 1,
    borderColor: CARE.border,
  },
  timeChipSelected: {
    borderColor: CARE.teal,
    backgroundColor: CARE.teal,
  },
  timeText: {
    color: CARE.muted,
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
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARE.border,
    ...shadows.card,
  },
  reminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARE.tealSoft,
  },
  reminderCopy: {
    flex: 1,
  },
  reminderTitle: {
    color: CARE.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  reminderDescription: {
    marginTop: spacing.xxs,
    color: CARE.muted,
    fontSize: 13,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.lg,
  },
  detailsToggleText: {
    color: CARE.teal,
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

import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { dayDistance, formatCareDate } from '@/features/care/date';
import {
  completeCareEvent,
  removeCareEvent,
  useCareEvents,
  useCareEventsHydrating,
} from '@/features/care/store';
import { CARE_TYPE_META } from '@/features/care/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { colors, shadows, spacing, typography } from '@/theme/tokens';

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

export default function CareEventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? ''
    : params.eventId ?? '';
  const { dog } = useDogProfile();
  const events = useCareEvents(dog.id, dog.name);
  const hydrating = useCareEventsHydrating(dog.id);
  const event = events.find((item) => item.id === eventId);
  const [working, setWorking] = useState(false);

  if (!event && hydrating) {
    // Apertura da notifica (cold-start): l'idratazione degli eventi è in
    // corso. Mostriamo uno spinner invece del flash "non trovato".
    return (
      <ScreenContainer style={styles.screen}>
        <StackScreenHeader title="Appuntamento" />
        <View style={styles.loading}>
          <ActivityIndicator color={CARE.teal} />
        </View>
      </ScreenContainer>
    );
  }

  if (!event) {
    return (
      <ScreenContainer style={styles.screen}>
        <StackScreenHeader title="Appuntamento" />
        <ErrorState
          title="Appuntamento non trovato"
          message="Potrebbe essere stato eliminato."
        />
      </ScreenContainer>
    );
  }

  const meta = CARE_TYPE_META[event.eventType];
  const completed = event.status === 'COMPLETED';
  const urgent = !completed && dayDistance(event.scheduledAt) <= 1;
  const scheduled = new Date(event.scheduledAt);

  const complete = async () => {
    setWorking(true);
    try {
      await completeCareEvent(event.id, dog.name);
      router.replace('/care' as never);
    } catch {
      Alert.alert('Non riesco ad aggiornare', 'Riprova tra poco.');
    } finally {
      setWorking(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Eliminare questo appuntamento?',
      'Verrà cancellato anche il promemoria.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await removeCareEvent(event.id, dog.name);
              router.replace('/care' as never);
            } catch {
              Alert.alert('Non riesco a eliminare', 'Riprova tra poco.');
              setWorking(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Appuntamento" />

      <View
        style={[
          styles.hero,
          urgent && styles.heroUrgent,
          completed && styles.heroDone,
        ]}
      >
        <View
          style={[
            styles.dateBadge,
            urgent && styles.dateBadgeUrgent,
            completed && styles.dateBadgeDone,
          ]}
        >
          {completed ? (
            <Ionicons name="checkmark" size={28} color={colors.success} />
          ) : (
            <>
              <Text
                style={[styles.dateDay, urgent && styles.dateDayUrgent]}
              >
                {String(scheduled.getDate())}
              </Text>
              <Text
                style={[styles.dateMonth, urgent && styles.dateMonthUrgent]}
              >
                {scheduled
                  .toLocaleDateString('it-IT', { month: 'short' })
                  .replace('.', '')}
              </Text>
            </>
          )}
        </View>
        <View
          style={[
            styles.typePill,
            urgent && styles.typePillUrgent,
            completed && styles.typePillDone,
          ]}
        >
          <Ionicons
            name={meta.icon}
            size={14}
            color={
              completed ? colors.success : urgent ? CARE.coral : CARE.teal
            }
          />
          <Text
            style={[
              styles.type,
              urgent && styles.typeUrgent,
              completed && styles.typeDone,
            ]}
          >
            {meta.label}
          </Text>
        </View>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.date}>
          {formatCareDate(event.scheduledAt, event.allDay)}
        </Text>
        {completed ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneText}>Completato</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.infoCard}>
        <InfoRow
          icon="notifications-outline"
          label={
            event.reminderEnabled
              ? 'Promemoria il giorno prima'
              : 'Promemoria disattivato'
          }
        />
        {event.location ? (
          <InfoRow icon="location-outline" label={event.location} />
        ) : null}
        {event.notes ? (
          <InfoRow icon="document-text-outline" label={event.notes} />
        ) : null}
      </View>

      {!completed ? (
        <Button
          title="Segna come fatto"
          variant="secondary"
          icon={
            <Ionicons name="checkmark" size={20} color={colors.textOnPrimary} />
          }
          onPress={complete}
          loading={working}
          style={styles.primary}
        />
      ) : null}
      <Button
        title="Elimina"
        variant="outline"
        onPress={remove}
        disabled={working}
        style={styles.delete}
      />
    </ScreenContainer>
  );
}

function InfoRow({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={CARE.teal} />
      </View>
      <Text style={styles.infoText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: CARE.bg,
  },
  hero: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARE.border,
    ...shadows.card,
  },
  heroUrgent: {
    borderColor: '#FBCFC5',
    backgroundColor: '#FFFBFA',
  },
  heroDone: {
    borderColor: CARE.border,
  },
  dateBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARE.tealSoft,
  },
  dateBadgeUrgent: {
    backgroundColor: CARE.peach,
  },
  dateBadgeDone: {
    backgroundColor: colors.successSoft,
  },
  dateDay: {
    color: CARE.teal,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    lineHeight: 24,
  },
  dateDayUrgent: {
    color: CARE.coral,
  },
  dateMonth: {
    color: CARE.teal,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
  },
  dateMonthUrgent: {
    color: CARE.coral,
  },
  typePill: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    backgroundColor: CARE.tealSoft,
  },
  typePillUrgent: {
    backgroundColor: CARE.peach,
  },
  typePillDone: {
    backgroundColor: colors.successSoft,
  },
  type: {
    color: CARE.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
  },
  typeUrgent: {
    color: CARE.coral,
  },
  typeDone: {
    color: colors.success,
  },
  title: {
    marginTop: spacing.md,
    color: CARE.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  date: {
    marginTop: spacing.sm,
    color: CARE.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  doneBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    backgroundColor: colors.successSoft,
  },
  doneText: {
    color: colors.success,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  infoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARE.border,
    ...shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARE.tealSoft,
  },
  infoText: {
    flex: 1,
    color: CARE.text,
    fontSize: 13,
    lineHeight: 13 * typography.lineHeight.normal,
  },
  primary: {
    marginTop: spacing.xl,
  },
  delete: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
});

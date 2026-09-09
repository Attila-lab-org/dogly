import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { CareEventCard } from '@/features/care/CareEventCard';
import { dayDistance, formatCareDate, relativeCareDate } from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { CARE_TYPE_META } from '@/features/care/types';
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

export default function CareAgendaScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const events = useCareEvents(dog.id, dog.name);
  // "Prossimo" = solo eventi SCHEDULED futuri (nextCareEvent): un evento
  // passato non completato non deve mai apparire come prossimo; resta però
  // in "In programma" finché non viene completato o eliminato.
  const next = nextCareEvent(dog.id);
  const upcoming = events.filter(
    (event) => event.status === 'SCHEDULED' && event.id !== next?.id,
  );
  const history = events
    .filter((event) => event.status !== 'SCHEDULED')
    .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
  const nextUrgent = next ? dayDistance(next.scheduledAt) <= 1 : false;
  const nextDate = next ? new Date(next.scheduledAt) : null;

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title={`Agenda di ${dog.name}`} />

      {next && nextDate ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/care/${next.id}` as never)}
          style={({ pressed }) => [
            styles.nextCard,
            nextUrgent && styles.nextCardUrgent,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.nextTop}>
            <View
              style={[
                styles.nextDateBadge,
                nextUrgent ? styles.nextDateUrgent : styles.nextDateTeal,
              ]}
            >
              <Text
                style={[
                  styles.nextDay,
                  nextUrgent && styles.nextDayUrgent,
                ]}
              >
                {String(nextDate.getDate())}
              </Text>
              <Text
                style={[
                  styles.nextMonth,
                  nextUrgent && styles.nextMonthUrgent,
                ]}
              >
                {nextDate
                  .toLocaleDateString('it-IT', { month: 'short' })
                  .replace('.', '')}
              </Text>
            </View>
            <View
              style={[
                styles.nextBadge,
                nextUrgent && styles.nextBadgeUrgent,
              ]}
            >
              <Text
                style={[
                  styles.nextBadgeText,
                  nextUrgent && styles.nextBadgeTextUrgent,
                ]}
              >
                {relativeCareDate(next.scheduledAt)}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.nextLabel,
              nextUrgent && styles.nextLabelUrgent,
            ]}
          >
            PROSSIMO APPUNTAMENTO
          </Text>
          <Text style={styles.nextTitle}>{next.title}</Text>
          <Text style={styles.nextDate}>
            {formatCareDate(next.scheduledAt, next.allDay)}
          </Text>
          <View style={styles.nextMeta}>
            <Ionicons
              name={CARE_TYPE_META[next.eventType].icon}
              size={15}
              color={nextUrgent ? CARE.coral : CARE.teal}
            />
            <Text style={styles.nextMetaText}>
              {CARE_TYPE_META[next.eventType].label}
            </Text>
          </View>
          {next.reminderEnabled ? (
            <View style={styles.reminderRow}>
              <Ionicons
                name="notifications-outline"
                size={15}
                color={CARE.teal}
              />
              <Text style={styles.reminderText}>Avviso il giorno prima</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={30} color={CARE.teal} />
          </View>
          <Text style={styles.emptyTitle}>Nessun appuntamento</Text>
          <Text style={styles.emptyText}>
            Aggiungi il prossimo vaccino o una visita.
          </Text>
        </View>
      )}

      <Button
        title="Aggiungi all’agenda"
        variant="secondary"
        icon={<Ionicons name="add" size={21} color={colors.textOnPrimary} />}
        onPress={() => router.push('/care/new')}
        style={styles.addButton}
      />

      {upcoming.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>In programma</Text>
          <View style={styles.list}>
            {upcoming.map((event) => (
              <CareEventCard
                key={event.id}
                event={event}
                onPress={() => router.push(`/care/${event.id}` as never)}
              />
            ))}
          </View>
        </>
      ) : null}

      {history.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Già fatti</Text>
          <View style={styles.list}>
            {history.map((event) => (
              <CareEventCard
                key={event.id}
                event={event}
                onPress={() => router.push(`/care/${event.id}` as never)}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: CARE.bg,
  },
  nextCard: {
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARE.border,
    ...shadows.card,
  },
  nextCardUrgent: {
    borderColor: '#FBCFC5',
    backgroundColor: '#FFFBFA',
  },
  pressed: {
    opacity: 0.88,
  },
  nextTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  nextDateBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextDateTeal: {
    backgroundColor: CARE.tealSoft,
  },
  nextDateUrgent: {
    backgroundColor: CARE.peach,
  },
  nextDay: {
    color: CARE.teal,
    fontSize: 18,
    fontWeight: typography.weight.bold,
    lineHeight: 20,
  },
  nextDayUrgent: {
    color: CARE.coral,
  },
  nextMonth: {
    color: CARE.teal,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
  },
  nextMonthUrgent: {
    color: CARE.coral,
  },
  nextBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    backgroundColor: CARE.tealSoft,
  },
  nextBadgeUrgent: {
    backgroundColor: CARE.peach,
  },
  nextBadgeText: {
    color: CARE.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  nextBadgeTextUrgent: {
    color: CARE.coral,
  },
  nextLabel: {
    color: CARE.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.7,
  },
  nextLabelUrgent: {
    color: CARE.coral,
  },
  nextTitle: {
    marginTop: spacing.xs,
    color: CARE.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  nextDate: {
    marginTop: spacing.xs,
    color: CARE.muted,
    fontSize: 13,
  },
  nextMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  nextMetaText: {
    color: CARE.muted,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  reminderText: {
    color: CARE.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  addButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: CARE.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARE.border,
    ...shadows.card,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARE.tealSoft,
  },
  emptyTitle: {
    marginTop: spacing.md,
    color: CARE.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: CARE.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});

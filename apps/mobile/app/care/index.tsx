import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { CareEventCard } from '@/features/care/CareEventCard';
import { formatCareDate, relativeCareDate } from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { CARE_TYPE_META } from '@/features/care/types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function CareAgendaScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const events = useCareEvents(dog.id);
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

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Agenda di ${dog.name}`} />

      {next ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/care/${next.id}` as never)}
          style={({ pressed }) => [
            styles.nextCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.nextTop}>
            <View style={styles.nextIcon}>
              <Ionicons
                name={CARE_TYPE_META[next.eventType].icon}
                size={26}
                color={colors.primary}
              />
            </View>
            <View style={styles.nextBadge}>
              <Text style={styles.nextBadgeText}>
                {relativeCareDate(next.scheduledAt)}
              </Text>
            </View>
          </View>
          <Text style={styles.nextLabel}>PROSSIMO APPUNTAMENTO</Text>
          <Text style={styles.nextTitle}>{next.title}</Text>
          <Text style={styles.nextDate}>
            {formatCareDate(next.scheduledAt, next.allDay)}
          </Text>
          {next.reminderEnabled ? (
            <View style={styles.reminderRow}>
              <Ionicons
                name="notifications-outline"
                size={15}
                color={colors.accent}
              />
              <Text style={styles.reminderText}>Avviso il giorno prima</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Nessun appuntamento</Text>
          <Text style={styles.emptyText}>
            Aggiungi il prossimo vaccino o una visita.
          </Text>
        </View>
      )}

      <Button
        title="Aggiungi all’agenda"
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
  nextCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.85,
  },
  nextTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  nextIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  nextBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  nextBadgeText: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  nextLabel: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.7,
  },
  nextTitle: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  nextDate: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  reminderText: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  addButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.text,
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
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  emptyTitle: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});

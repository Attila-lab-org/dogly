import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, typography } from '../../theme/tokens';
import { dayDistance, formatCareDate, relativeCareDate } from './date';
import { CARE_TYPE_META, type CareEvent } from './types';

const CARE = {
  text: '#1A2B48',
  muted: '#64748B',
  border: '#EDF2F7',
  teal: '#2DAAAB',
  tealSoft: '#E0F7F6',
  coral: '#FF8B74',
  peach: '#FFF1EE',
} as const;

export function CareEventCard({
  event,
  onPress,
}: {
  event: CareEvent;
  onPress: () => void;
}) {
  const meta = CARE_TYPE_META[event.eventType];
  const completed = event.status === 'COMPLETED';
  const distance = dayDistance(event.scheduledAt);
  const urgent = !completed && distance <= 1;
  const scheduled = new Date(event.scheduledAt);
  const dayLabel = String(scheduled.getDate());
  const monthLabel = scheduled
    .toLocaleDateString('it-IT', { month: 'short' })
    .replace('.', '');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatCareDate(event.scheduledAt, event.allDay)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        completed && styles.completedCard,
        urgent && styles.urgentCard,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.dateBadge,
          urgent ? styles.dateBadgeUrgent : styles.dateBadgeTeal,
          completed && styles.dateBadgeDone,
        ]}
      >
        <Text
          style={[
            styles.dateDay,
            urgent && styles.dateDayUrgent,
            completed && styles.dateDayDone,
          ]}
        >
          {dayLabel}
        </Text>
        <Text
          style={[
            styles.dateMonth,
            urgent && styles.dateMonthUrgent,
            completed && styles.dateMonthDone,
          ]}
        >
          {monthLabel}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
          <View
            style={[
              styles.statusPill,
              completed && styles.statusPillDone,
              urgent && !completed && styles.statusPillUrgent,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                completed && styles.statusTextDone,
                urgent && !completed && styles.statusTextUrgent,
              ]}
            >
              {completed ? 'Fatto' : relativeCareDate(event.scheduledAt)}
            </Text>
          </View>
        </View>

        <Text style={styles.subtitle} numberOfLines={1}>
          {meta.label}
          {event.notes ? ` · ${event.notes}` : ''}
        </Text>

        <Text style={styles.date}>
          {formatCareDate(event.scheduledAt, event.allDay)}
        </Text>

        {event.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={CARE.muted} />
            <Text style={styles.location} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.iconMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
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
  urgentCard: {
    borderColor: '#FBCFC5',
    backgroundColor: '#FFFBFA',
  },
  completedCard: {
    opacity: 0.78,
  },
  pressed: {
    opacity: 0.88,
  },
  dateBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeTeal: {
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
    fontSize: 16,
    fontWeight: typography.weight.bold,
    lineHeight: 18,
  },
  dateDayUrgent: {
    color: CARE.coral,
  },
  dateDayDone: {
    color: colors.success,
  },
  dateMonth: {
    color: CARE.teal,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    lineHeight: 13,
  },
  dateMonthUrgent: {
    color: CARE.coral,
  },
  dateMonthDone: {
    color: colors.success,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: CARE.text,
    fontSize: 16,
    fontWeight: typography.weight.bold,
  },
  statusPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: CARE.tealSoft,
  },
  statusPillUrgent: {
    backgroundColor: CARE.peach,
  },
  statusPillDone: {
    backgroundColor: colors.successSoft,
  },
  statusText: {
    color: CARE.teal,
    fontSize: 11,
    fontWeight: typography.weight.bold,
  },
  statusTextUrgent: {
    color: CARE.coral,
  },
  statusTextDone: {
    color: colors.success,
  },
  subtitle: {
    color: CARE.muted,
    fontSize: 13,
  },
  date: {
    color: CARE.muted,
    fontSize: 13,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: 2,
  },
  location: {
    flex: 1,
    color: CARE.muted,
    fontSize: 13,
  },
});

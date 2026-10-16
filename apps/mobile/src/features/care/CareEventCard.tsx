import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, typography } from '../../theme/tokens';
import Animated from 'react-native-reanimated';
import { usePressSpring } from '../../components/pressSpring';
import { dayDistance, formatCareDate, relativeCareDate } from './date';
import { CARE_TYPE_META, type CareEvent } from './types';
import type { CareEventType } from './types';
import { CuteIcon, type CuteIconName } from '../../components/CuteIcon';

const CARE = {
  text: '#1A2B48',
  muted: '#64748B',
  border: '#EDF2F7',
  teal: '#2DAAAB',
  tealSoft: '#E0F7F6',
  coral: '#FF8B74',
  peach: '#FFF1EE',
} as const;

/** Tinte per tipo di appuntamento (sfondi soft; il testo resta navy). */
const TYPE_TINT: Record<CareEventType, { bg: string; icon: CuteIconName; iconBg: string; iconFg: string }> = {
  VACCINE: { bg: '#E3EFFE', icon: 'bolt', iconBg: '#DBEAFE', iconFg: '#2563EB' },
  VET_VISIT: { bg: '#FFF1EE', icon: 'heart', iconBg: '#FFE3D9', iconFg: '#EA580C' },
  PARASITE_TREATMENT: { bg: '#DFF3EC', icon: 'leaf', iconBg: '#CCFBF1', iconFg: '#0D9488' },
  EXAM: { bg: '#F0EBFB', icon: 'search', iconBg: '#E6DEF8', iconFg: '#7C3AED' },
  THERAPY: { bg: '#F0EBFB', icon: 'paw', iconBg: '#E6DEF8', iconFg: '#7C3AED' },
  OTHER: { bg: colors.surfaceMuted, icon: 'clock', iconBg: colors.surfaceMuted, iconFg: colors.textSecondary },
};

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

  const press = usePressSpring();
  const tint = TYPE_TINT[event.eventType];
  return (
    <Animated.View style={press.style}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatCareDate(event.scheduledAt, event.allDay)}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: completed ? colors.surface : tint.bg },
        urgent && styles.urgentCard,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.dateBadge,
          completed
            ? styles.dateBadgeDone
            : { backgroundColor: tint.iconBg },
        ]}
      >
        {completed ? (
          <Ionicons name="checkmark" size={22} color={colors.success} />
        ) : (
          <CuteIcon name={tint.icon} size={24} color={tint.iconFg} secondary={tint.iconBg} />
        )}
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

      {event.reminderEnabled && !completed ? (
        <Ionicons name="notifications-outline" size={16} color={CARE.teal} style={styles.bell} />
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.iconMuted} />
    </Pressable>
    </Animated.View>
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
  bell: { marginRight: -4 },
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

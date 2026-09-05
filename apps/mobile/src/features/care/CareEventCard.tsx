import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatCareDate, relativeCareDate } from './date';
import { CARE_TYPE_META, type CareEvent } from './types';

export function CareEventCard({
  event,
  onPress,
}: {
  event: CareEvent;
  onPress: () => void;
}) {
  const meta = CARE_TYPE_META[event.eventType];
  const completed = event.status === 'COMPLETED';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatCareDate(event.scheduledAt, event.allDay)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        completed && styles.completedCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, completed && styles.completedIcon]}>
        <Ionicons
          name={completed ? 'checkmark' : meta.icon}
          size={22}
          color={completed ? colors.success : colors.primary}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={styles.relative}>
            {completed ? 'Fatto' : relativeCareDate(event.scheduledAt)}
          </Text>
        </View>
        <Text style={styles.date}>
          {formatCareDate(event.scheduledAt, event.allDay)}
        </Text>
        {event.location ? (
          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={13}
              color={colors.textMuted}
            />
            <Text style={styles.location} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completedCard: {
    opacity: 0.72,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  completedIcon: {
    backgroundColor: colors.successSoft,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  relative: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  date: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  location: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.size.xs,
  },
});

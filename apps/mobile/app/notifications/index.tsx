import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components';
import { useCareEvents } from '@/features/care/store';
import { formatCareDate, relativeCareDate } from '@/features/care/date';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function NotificationsScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const careEvents = useCareEvents(dog.id).filter(
    (event) => event.status === 'SCHEDULED' && event.reminderEnabled,
  );

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Notifiche" />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/notifications')}
        style={styles.settingsLink}
      >
        <Ionicons name="options-outline" size={18} color={colors.primary} />
        <Text style={styles.settingsText}>Gestisci le notifiche</Text>
      </Pressable>

      <Text style={styles.section}>Promemoria in programma</Text>
      {careEvents.length > 0 ? (
        <View style={styles.list}>
          {careEvents.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              onPress={() => router.push(`/care/${event.id}` as never)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
            >
              <View style={styles.icon}>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={colors.warning}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{event.title}</Text>
                  <Text style={styles.relative}>
                    {relativeCareDate(event.scheduledAt)}
                  </Text>
                </View>
                <Text style={styles.description}>
                  Avviso il giorno prima ·{' '}
                  {formatCareDate(event.scheduledAt, event.allDay)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons
            name="notifications-outline"
            size={30}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>Tutto tranquillo</Text>
          <Text style={styles.emptyText}>
            Qui vedrai avvisi e promemoria importanti.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
    marginBottom: spacing.xl,
    paddingVertical: spacing.xs,
  },
  settingsText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  section: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  relative: {
    color: colors.warning,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  description: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});

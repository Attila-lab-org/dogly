/**
 * Centro notifiche (sez. 6): sezioni per tipo.
 * - "Promemoria agenda": eventi care futuri con reminder attivo (dati reali
 *   dallo store care, idratato da API quando configurata).
 * - "Risultati": ultime analisi completate da GET /v1/diary (API attiva);
 *   in mock gate dev mostra i mock; con API attiva e lista vuota → empty
 *   state onesto, mai notifiche inventate.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components';
import { useCareEvents } from '@/features/care/store';
import { formatCareDate, relativeCareDate } from '@/features/care/date';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { StackScreenHeader } from '@/features/secondary/components';
import { queryKeys } from '@/lib/queryClient';
import { fetchDiaryPage, formatInsightTimestamp } from '@/features/home/api';
import { diaryEntriesMock } from '@/mocks/core';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface ResultItem {
  id: string;
  title: string;
  whenLabel: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  const careEvents = useCareEvents(dog.id).filter(
    (event) =>
      event.status === 'SCHEDULED' &&
      event.reminderEnabled &&
      Date.parse(event.scheduledAt) >= Date.now(),
  );

  // Risultati recenti: timeline reale, solo behavior completati
  const resultsQuery = useQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dog.id), 'results'],
    queryFn: () => fetchDiaryPage({ dogId: dog.id, domain: 'BEHAVIOR', limit: 5 }),
    enabled: realEnabled,
  });

  const results: ResultItem[] = realEnabled
    ? (resultsQuery.data?.items ?? [])
        .filter((item) => item.status === 'COMPLETED')
        .map((item) => ({
          id: item.id,
          title: item.title,
          whenLabel: formatInsightTimestamp(item.created_at),
        }))
    : diaryEntriesMock
        .filter((entry) => entry.domain === 'BEHAVIOR')
        .slice(0, 3)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          whenLabel: formatInsightTimestamp(entry.occurredAt),
        }));

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

      <Text style={styles.section}>Promemoria agenda</Text>
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
        <Text style={styles.emptySection}>
          Nessun promemoria in programma.
        </Text>
      )}

      <Text style={styles.section}>Risultati</Text>
      {results.length > 0 ? (
        <View style={styles.list}>
          {results.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() =>
                realEnabled
                  ? router.push(`/behavior/result/${item.id}`)
                  : router.push(`/diary/event/${item.id}`)
              }
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
            >
              <View style={[styles.icon, styles.iconResult]}>
                <Ionicons
                  name="happy-outline"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={[styles.relative, styles.relativeResult]}>
                    {item.whenLabel}
                  </Text>
                </View>
                <Text style={styles.description}>
                  Analisi di {dog.name} completata
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
            Qui vedrai avvisi e risultati importanti appena arrivano.
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
    marginTop: spacing.md,
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
  iconResult: {
    backgroundColor: colors.accentSoft,
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
  relativeResult: {
    color: colors.accent,
  },
  description: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  emptySection: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
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

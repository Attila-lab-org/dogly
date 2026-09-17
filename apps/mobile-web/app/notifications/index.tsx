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
import { colors, shadows, spacing, typography } from '@/theme/tokens';

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

  const careEvents = useCareEvents(dog.id, dog.name).filter(
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
    : [];

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Notifiche" />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/notifications')}
        style={styles.settingsLink}
      >
        <Ionicons name="options-outline" size={18} color={colors.teal} />
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
              <View style={[styles.icon, styles.iconCare]}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color="#0284C7"
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <View style={styles.titleWithDot}>
                    <View style={styles.unreadDot} />
                    <Text style={styles.title}>{event.title}</Text>
                  </View>
                  <Text style={styles.timestamp}>
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
                color={colors.iconMuted}
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
                  size={18}
                  color={colors.teal}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <View style={styles.titleWithDot}>
                    <View style={styles.unreadDot} />
                    <Text style={styles.title}>{item.title}</Text>
                  </View>
                  <Text style={styles.timestamp}>{item.whenLabel}</Text>
                </View>
                <Text style={styles.description}>
                  Analisi di {dog.name} completata
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.iconMuted}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <View style={[styles.icon, styles.iconResult]}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.teal}
            />
          </View>
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
  screen: {
    backgroundColor: '#F8FAFC',
  },
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
    color: colors.teal,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    color: '#1A2B48',
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCare: {
    backgroundColor: '#E0F2FE',
  },
  iconResult: {
    backgroundColor: colors.tealSoft,
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleWithDot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  title: {
    flex: 1,
    color: '#1A2B48',
    fontSize: 15,
    fontWeight: typography.weight.medium,
  },
  timestamp: {
    color: '#8295A8',
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  emptyTitle: {
    marginTop: spacing.md,
    color: '#1A2B48',
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

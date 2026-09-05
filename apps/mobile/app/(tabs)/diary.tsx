/**
 * Tab Diario (Spec V1 sez. 5.1, 6) — timeline unificata cursor-paginata.
 * Con API attiva: GET /v1/diary?cursor=…&domain=… (sez. 9), paginazione
 * cursore vera ("Mostra eventi precedenti" carica davvero la pagina
 * successiva; a fine lista un testo onesto la sostituisce).
 * In mock gate dev: dati mock, nessuna paginazione simulata.
 * Filtri: Tutti / Comportamento / Digestione. Stati obbligatori: empty,
 * filter, mixed behavior/digestive, deleted media (badge sulle righe).
 * Il design language segue UX_REFERENCE (card bianche, icone teal).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenContainer,
} from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { diaryEntriesMock } from '@/mocks/core';
import type { DiaryDomain, DiaryEntry } from '@/features/core/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { queryKeys } from '@/lib/queryClient';
import { fetchDiaryPage, mapDiaryItemToEntry } from '@/features/home/api';

type DiaryFilter = 'ALL' | DiaryDomain;

const FILTERS: { key: DiaryFilter; label: string }[] = [
  { key: 'ALL', label: 'Tutti' },
  { key: 'BEHAVIOR', label: 'Comportamento' },
  { key: 'DIGESTIVE', label: 'Digestione' },
];

const DOMAIN_ICONS: Record<DiaryDomain, keyof typeof Ionicons.glyphMap> = {
  BEHAVIOR: 'videocam-outline',
  DIGESTIVE: 'leaf-outline',
};

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (d: Date) =>
    Date.parse(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  const diffDays = Math.round((startOf(new Date()) - startOf(date)) / dayMs);
  if (diffDays <= 0) return 'Oggi';
  if (diffDays === 1) return 'Ieri';
  return date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DiaryRow({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View
        style={[
          styles.rowIcon,
          entry.domain === 'DIGESTIVE' && styles.rowIconDigestive,
        ]}
      >
        <Ionicons
          name={DOMAIN_ICONS[entry.domain]}
          size={18}
          color={entry.domain === 'DIGESTIVE' ? colors.accent : colors.primary}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        <Text style={styles.rowSubtitle}>
          {timeLabel(entry.occurredAt)}
          {entry.subtitle ? ` · ${entry.subtitle}` : ''}
        </Text>
        {entry.mediaDeleted && (
          <View style={styles.deletedRow}>
            <Ionicons name="trash-bin-outline" size={12} color={colors.textMuted} />
            <Text style={styles.deletedText}>Video eliminato (privacy)</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function DiaryScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const [filter, setFilter] = useState<DiaryFilter>('ALL');

  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  // Timeline reale: cursor pagination server-side (GET /v1/diary, sez. 9)
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dog.id), filter],
    queryFn: ({ pageParam }) =>
      fetchDiaryPage({
        dogId: dog.id,
        domain: filter === 'ALL' ? undefined : filter,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: realEnabled,
  });

  const entries = useMemo<DiaryEntry[]>(() => {
    if (!realEnabled) {
      return diaryEntriesMock.filter(
        (entry) => filter === 'ALL' || entry.domain === filter,
      );
    }
    return (query.data?.pages ?? [])
      .flatMap((page) => page.items)
      .map(mapDiaryItemToEntry)
      .filter((entry): entry is DiaryEntry => entry !== null);
  }, [realEnabled, filter, query.data]);

  // Raggruppamento per giorno (timeline cursor, sez. 5.1)
  const groups = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    for (const entry of entries) {
      const key = entry.occurredAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <ScreenContainer>
      <Text style={styles.title}>Diario</Text>
      <Text style={styles.subtitle}>
        Tutto quello che ho capito di {dog.name}, giorno per giorno.
      </Text>

      {/* Filtri (sez. 5.1: All / Behavior / Digestive) */}
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              style={[styles.filterPill, active && styles.filterPillActive]}
              testID={`diary-filter-${f.key.toLowerCase()}`}
            >
              <Text
                style={[styles.filterLabel, active && styles.filterLabelActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {realEnabled && query.isLoading ? (
        <LoadingState message="Carico il diario…" />
      ) : realEnabled && query.isError ? (
        <ErrorState
          title="Non riesco a caricare il diario"
          message="Controlla la connessione e riprova."
          onRetry={() => void query.refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title={
            filter === 'ALL'
              ? 'Il diario è ancora vuoto'
              : 'Nessun evento in questo filtro'
          }
          message={`Registra il primo video di ${dog.name}: le analisi appariranno qui, insieme ai controlli digestivi.`}
          icon={<Ionicons name="calendar-outline" size={40} color={colors.textMuted} />}
          actionLabel={`Capisci ${dog.name}`}
          onAction={() => router.push('/behavior/capture')}
        />
      ) : (
        <ScrollView
          style={styles.timeline}
          contentContainerStyle={styles.timelineContent}
          showsVerticalScrollIndicator={false}
        >
          {groups.map(([day, dayEntries]) => (
            <View key={day} style={styles.group}>
              <Text style={styles.groupLabel}>{dayLabel(dayEntries[0].occurredAt)}</Text>
              <View style={styles.groupCard}>
                {dayEntries.map((entry, index) => (
                  <View key={entry.id}>
                    <DiaryRow
                      entry={entry}
                      onPress={() =>
                        router.push({
                          pathname: '/diary/event/[eventId]',
                          params: {
                            eventId: entry.id,
                            domain: entry.domain,
                            occurredAt: entry.occurredAt,
                            deleted: entry.mediaDeleted ? '1' : '0',
                            title: entry.title,
                            subtitle: entry.subtitle ?? '',
                          },
                        } as never)
                      }
                    />
                    {index < dayEntries.length - 1 && (
                      <View style={styles.rowDivider} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
          {/* Paginazione cursore vera: il chip carica la pagina successiva
              solo se next_cursor esiste; altrimenti testo onesto. */}
          {realEnabled && query.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mostra eventi precedenti"
              onPress={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              style={styles.moreChip}
            >
              <Chip
                label={
                  query.isFetchingNextPage
                    ? 'Caricamento…'
                    : 'Mostra eventi precedenti'
                }
                tone="neutral"
              />
            </Pressable>
          ) : (
            <Text style={styles.endNote}>
              Stai vedendo gli eventi più recenti.
            </Text>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterPill: {
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  filterLabelActive: {
    color: colors.textOnPrimary,
  },
  timeline: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  timelineContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDigestive: {
    backgroundColor: colors.accentSoft,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  deletedText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  moreChip: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  endNote: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});

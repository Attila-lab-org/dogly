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
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenContainer,
} from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { diaryEntriesMock } from '@/mocks/core';
import type { DiaryDomain, DiaryEntry } from '@/features/core/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { queryKeys } from '@/lib/queryClient';
import { fetchDiaryPage, mapDiaryItemToEntry } from '@/features/home/api';

type DiaryFilter = 'ALL' | DiaryDomain;
type TimelineItem =
  | {
      kind: 'header';
      key: string;
      day: string;
      current: string;
      startsMonth: boolean;
    }
  | {
      kind: 'entry';
      key: string;
      entry: DiaryEntry;
      first: boolean;
      last: boolean;
    };

const FILTERS: { key: DiaryFilter; label: string }[] = [
  { key: 'ALL', label: 'Tutti' },
  { key: 'BEHAVIOR', label: 'Comportamento' },
  { key: 'DIGESTIVE', label: 'Salute' },
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

function monthLabel(iso: string): string {
  const value = new Date(iso).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });
  return value.charAt(0).toLocaleUpperCase('it-IT') + value.slice(1);
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
  const [search, setSearch] = useState('');

  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  // Timeline reale: cursor pagination server-side (GET /v1/diary, sez. 9)
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dog.id), filter, search.trim()],
    queryFn: ({ pageParam }) =>
      fetchDiaryPage({
        dogId: dog.id,
        domain: filter === 'ALL' ? undefined : filter,
        cursor: pageParam,
        limit: 20,
        q: search.trim() || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: realEnabled,
  });

  const entries = useMemo<DiaryEntry[]>(() => {
    const source = !realEnabled
      ? diaryEntriesMock.filter(
        (entry) => filter === 'ALL' || entry.domain === filter,
      )
      : (query.data?.pages ?? [])
          .flatMap((page) => page.items)
          .map(mapDiaryItemToEntry)
          .filter((entry): entry is DiaryEntry => entry !== null);
    const term = search.trim().toLocaleLowerCase('it-IT');
    if (!term) return source;
    return source.filter((entry) =>
      `${entry.title} ${entry.subtitle ?? ''}`
        .toLocaleLowerCase('it-IT')
        .includes(term),
    );
  }, [realEnabled, filter, query.data, search]);

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

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    groups.forEach(([day, dayEntries], groupIndex) => {
      const previous = groups[groupIndex - 1]?.[1][0]?.occurredAt;
      const current = dayEntries[0].occurredAt;
      items.push({
        kind: 'header',
        key: `header-${day}`,
        day,
        current,
        startsMonth: !previous || previous.slice(0, 7) !== current.slice(0, 7),
      });
      dayEntries.forEach((entry, index) => {
        items.push({
          kind: 'entry',
          key: entry.id,
          entry,
          first: index === 0,
          last: index === dayEntries.length - 1,
        });
      });
    });
    return items;
  }, [groups]);

  return (
    <ScreenContainer>
      <Text style={styles.title}>Le analisi di {dog.name}</Text>
      <Text style={styles.subtitle}>
        Tutto quello che ho capito di {dog.name}, giorno per giorno.
      </Text>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Cerca nelle analisi"
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca nelle analisi…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancella ricerca"
            onPress={() => setSearch('')}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

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
          actionLabel={`Scopri i segnali di ${dog.name}`}
          onAction={() => router.push('/behavior/capture')}
        />
      ) : (
        <FlatList
          style={styles.timeline}
          contentContainerStyle={styles.timelineContent}
          showsVerticalScrollIndicator={false}
          data={timelineItems}
          keyExtractor={(item) => item.key}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (
              realEnabled &&
              query.hasNextPage &&
              !query.isFetchingNextPage
            ) {
              void query.fetchNextPage();
            }
          }}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View style={styles.groupHeader}>
                  {item.startsMonth ? (
                    <Text style={styles.monthLabel}>
                      {monthLabel(item.current)}
                    </Text>
                  ) : null}
                  <Text style={styles.groupLabel}>
                    {dayLabel(item.current)}
                  </Text>
                </View>
              );
            }
            const { entry } = item;
            return (
              <View
                style={[
                  styles.entryCard,
                  item.first && styles.entryCardFirst,
                  item.last && styles.entryCardLast,
                ]}
              >
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
                {!item.last ? <View style={styles.rowDivider} /> : null}
              </View>
            );
          }}
          ListFooterComponent={
            realEnabled ? (
              query.isFetchingNextPage ? (
                <Text style={styles.endNote}>Carico altri eventi…</Text>
              ) : !query.hasNextPage ? (
              <Text style={styles.endNote}>
                Stai vedendo gli eventi più recenti.
              </Text>
              ) : null
            ) : null
          }
        />
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
  monthLabel: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
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
  groupHeader: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  entryCard: {
    backgroundColor: colors.surface,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  entryCardFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    ...shadows.card,
  },
  entryCardLast: {
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
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
  endNote: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});

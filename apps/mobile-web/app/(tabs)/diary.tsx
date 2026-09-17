/**
 * Tab Diario (Spec V1 sez. 5.1, 6) — timeline unificata cursor-paginata.
 * Con API attiva: GET /v1/diary?cursor=…&domain=… (sez. 9), paginazione
 * cursore vera ("Mostra eventi precedenti" carica davvero la pagina
 * successiva; a fine lista un testo onesto la sostituisce).
 * In mock gate dev: dati mock, nessuna paginazione simulata.
 * Filtri: Tutti / Comportamento / Salute. Stati obbligatori: empty,
 * filter, mixed behavior/digestive, deleted media (badge sulle righe).
 * Visual language: anchor diary — #F8FAFC, card bianche radius 20,
 * pill filtri teal, status chip come Screen 3 (Relax / Gioco / Attenzione).
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
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
    }
  | {
      kind: 'entry';
      key: string;
      entry: DiaryEntry;
    };

type StatusChip = {
  label: string;
  bg: string;
  fg: string;
};

type IconTone = {
  name: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
};

const FILTERS: { key: DiaryFilter; label: string }[] = [
  { key: 'ALL', label: 'Tutti' },
  { key: 'BEHAVIOR', label: 'Comportamento' },
  { key: 'DIGESTIVE', label: 'Salute' },
];

const puppyPlaySource = require('../../assets/images/puppy-play.png');

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
  const day = date.getDate();
  const month = date.toLocaleDateString('it-IT', { month: 'long' });
  return `${day} ${month.charAt(0).toLocaleUpperCase('it-IT')}${month.slice(1)}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entryStatusChip(entry: DiaryEntry): StatusChip | null {
  const haystack = `${entry.title} ${entry.subtitle ?? ''}`.toLocaleLowerCase('it-IT');

  if (entry.domain === 'DIGESTIVE') {
    if (/morbid|variazion|flag|controll|attenzione/i.test(haystack)) {
      return { label: 'Attenzione', bg: '#FFF1EE', fg: '#EA580C' };
    }
    return { label: 'Confermato', bg: '#DCFCE7', fg: '#16A34A' };
  }
  if (/rilass|ripos|relax/i.test(haystack)) {
    return { label: 'Relax', bg: '#E0F7F6', fg: '#0D9488' };
  }
  if (/gioc|play|interazion/i.test(haystack)) {
    return { label: 'Gioco', bg: '#EEF2FF', fg: '#4F46E5' };
  }
  if (/attenzion|ambig|ipotes|contesto/i.test(haystack)) {
    return { label: 'Attenzione', bg: '#FFF1EE', fg: '#EA580C' };
  }
  if (/confermato/i.test(haystack)) {
    return { label: 'Confermato', bg: '#E0F7F6', fg: '#0D9488' };
  }
  return null;
}

function entryIconTone(entry: DiaryEntry): IconTone {
  const haystack = `${entry.title} ${entry.subtitle ?? ''}`.toLocaleLowerCase('it-IT');
  if (entry.domain === 'DIGESTIVE') {
    if (/morbid|variazion|flag|controll|attenzione/i.test(haystack)) {
      return { name: 'alert-circle-outline', bg: '#FFF1EE', fg: '#EA580C' };
    }
    return { name: 'leaf-outline', bg: '#DCFCE7', fg: '#16A34A' };
  }
  if (/gioc|play|interazion/i.test(haystack)) {
    return { name: 'tennisball-outline', bg: '#E0F7F6', fg: '#2DAAAB' };
  }
  if (/attenzion|ambig|ipotes|contesto/i.test(haystack)) {
    return { name: 'eye-outline', bg: '#E0F7F6', fg: '#2DAAAB' };
  }
  if (/rilass|ripos|relax/i.test(haystack)) {
    return { name: 'happy-outline', bg: '#E0F7F6', fg: '#2DAAAB' };
  }
  return { name: 'paw-outline', bg: '#E0F7F6', fg: '#2DAAAB' };
}

function DiaryRow({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const chip = entryStatusChip(entry);
  const icon = entryIconTone(entry);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.entryCard, pressed && styles.entryCardPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: icon.bg }]}>
        <Ionicons name={icon.name} size={20} color={icon.fg} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        {entry.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {entry.subtitle}
          </Text>
        ) : null}
        <Text style={styles.rowTime}>{timeLabel(entry.occurredAt)}</Text>
        {chip ? (
          <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.statusChipText, { color: chip.fg }]}>{chip.label}</Text>
          </View>
        ) : null}
        {entry.mediaDeleted ? (
          <View style={styles.deletedRow}>
            <Ionicons name="trash-bin-outline" size={12} color="#94A3B8" />
            <Text style={styles.deletedText}>Video eliminato (privacy)</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

function SoftState({
  title,
  message,
  actionLabel,
  onAction,
  loading,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.stateWrap}>
      <View style={styles.stateCircle}>
        {loading ? (
          <ActivityIndicator size="large" color="#2DAAAB" />
        ) : (
          <Image
            source={puppyPlaySource}
            style={styles.statePuppy}
            resizeMode="contain"
            accessibilityLabel="Cucciolo illustrato"
          />
        )}
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.stateAction, pressed && styles.stateActionPressed]}
        >
          <Text style={styles.stateActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function DiaryScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const [filter, setFilter] = useState<DiaryFilter>('ALL');
  const [search, setSearch] = useState('');

  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

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
    const source = (query.data?.pages ?? [])
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
  }, [filter, query.data, search]);

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
    groups.forEach(([day, dayEntries]) => {
      items.push({
        kind: 'header',
        key: `header-${day}`,
        day,
        current: dayEntries[0].occurredAt,
      });
      dayEntries.forEach((entry) => {
        items.push({
          kind: 'entry',
          key: entry.id,
          entry,
        });
      });
    });
    return items;
  }, [groups]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.title}>Diario</Text>
          <Text style={styles.subtitle}>
            I momenti e la salute di {dog.name}
          </Text>

          <View style={styles.search}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              accessibilityLabel="Cerca nelle analisi"
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca nelle analisi…"
              placeholderTextColor="#94A3B8"
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
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={styles.filtersScroll}
          >
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
          </ScrollView>

          {realEnabled && query.isLoading ? (
            <SoftState
              loading
              title="Carico il diario…"
              message={`Sto recuperando i momenti di ${dog.name}.`}
            />
          ) : realEnabled && query.isError ? (
            <SoftState
              title="Non riesco a caricare il diario"
              message="Controlla la connessione e riprova."
              actionLabel="Riprova"
              onAction={() => void query.refetch()}
            />
          ) : groups.length === 0 ? (
            <SoftState
              title={
                filter === 'ALL'
                  ? 'Il diario è ancora vuoto'
                  : 'Nessun evento in questo filtro'
              }
              message={`Registra il primo video di ${dog.name}: le analisi appariranno qui, insieme ai controlli digestivi.`}
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
                      <Text style={styles.groupLabel}>
                        {dayLabel(item.current)}
                      </Text>
                    </View>
                  );
                }
                const { entry } = item;
                return (
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
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: '#1A2B48',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '400',
    color: '#64748B',
    marginBottom: 16,
  },
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  searchInput: {
    flex: 1,
    color: '#1A2B48',
    fontSize: 14,
  },
  filtersScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
  },
  filterPill: {
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: '#F1F5F9',
  },
  filterPillActive: {
    backgroundColor: '#2DAAAB',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  filterLabelActive: {
    color: '#FFFFFF',
  },
  timeline: {
    flex: 1,
    marginHorizontal: -20,
  },
  timelineContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  groupHeader: {
    marginTop: 16,
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A2B48',
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  entryCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2B48',
  },
  rowSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  rowTime: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '400',
    color: '#94A3B8',
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  deletedText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  endNote: {
    alignSelf: 'center',
    marginTop: 8,
    fontSize: 12,
    color: '#94A3B8',
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingBottom: 40,
    gap: 12,
  },
  stateCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statePuppy: {
    width: 88,
    height: 88,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B48',
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  stateAction: {
    marginTop: 8,
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 22,
    backgroundColor: '#2DAAAB',
  },
  stateActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  stateActionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

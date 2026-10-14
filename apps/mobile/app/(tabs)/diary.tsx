/**
 * Tab Diario (Spec V1 sez. 5.1, 6) — "la storia delle sue giornate".
 * Timeline unificata cursor-paginata reale (GET /v1/diary, sez. 9),
 * ricerca con debounce, filtri Tutti / Comportamento / Salute.
 * Visual: header di giornata editoriali, card foto-first (media 16:9 in
 * cima), badge illustrati CuteIcon (stessa euristica di prima), ingresso
 * scaglionato delle prime card — reduce-motion → tutto statico.
 * Stati onesti: empty/error/loading senza dati inventati; in mock gate
 * dev i dati mock restano, senza paginazione simulata.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { DiaryDomain, DiaryEntry } from '@/features/core/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { queryKeys } from '@/lib/queryClient';
import { fetchDiaryPage, mapDiaryItemToEntry } from '@/features/home/api';
import { DiaryMediaCover } from '@/features/home/DiaryMediaCover';
import { CuteIcon, type CuteIconName } from '@/components/CuteIcon';
import { DogIllustration } from '@/components/DogIllustration';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

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

type StatusBadge = {
  label: string;
  icon: CuteIconName;
  bg: string;
  fg: string;
};

type IconTone = {
  name: CuteIconName;
  bg: string;
  fg: string;
};

const FILTERS: { key: DiaryFilter; label: string }[] = [
  { key: 'ALL', label: 'Tutti' },
  { key: 'BEHAVIOR', label: 'Comportamento' },
  { key: 'DIGESTIVE', label: 'Salute' },
];

/** Solo le prime card della prima pagina entrano animate. */
const ENTRANCE_ITEMS = 8;

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
  const label = date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${label.charAt(0).toLocaleUpperCase('it-IT')}${label.slice(1)}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entryStatusBadge(entry: DiaryEntry): StatusBadge | null {
  const haystack = `${entry.title} ${entry.subtitle ?? ''}`.toLocaleLowerCase('it-IT');

  if (entry.domain === 'DIGESTIVE') {
    if (/morbid|variazion|flag|controll|attenzione|osservare|peggior/i.test(haystack)) {
      return { label: 'Da osservare', icon: 'attention', bg: '#FFF1EE', fg: '#EA580C' };
    }
    return { label: 'Confermato', icon: 'paw', bg: '#DCFCE7', fg: '#16A34A' };
  }
  if (/attenzion|ambig|ipotes|contesto|incerto|watch/i.test(haystack)) {
    return { label: 'Da osservare', icon: 'attention', bg: '#FFF1EE', fg: '#EA580C' };
  }
  if (/gioc|play|rilass|ripos|relax|affetto|insieme|passeggi/i.test(haystack)) {
    return { label: 'Momenti insieme', icon: 'play', bg: '#E8F1FF', fg: '#2563EB' };
  }
  if (entry.status === 'COMPLETED') {
    return { label: 'Momenti insieme', icon: 'play', bg: '#E8F1FF', fg: '#2563EB' };
  }
  return null;
}

function entryIconTone(entry: DiaryEntry): IconTone {
  const haystack = `${entry.title} ${entry.subtitle ?? ''}`.toLocaleLowerCase('it-IT');
  if (entry.domain === 'DIGESTIVE') {
    if (/morbid|variazion|flag|controll|attenzione/i.test(haystack)) {
      return { name: 'alert', bg: '#FFF1EE', fg: '#EA580C' };
    }
    return { name: 'paw', bg: '#DCFCE7', fg: '#16A34A' };
  }
  if (/gioc|play|interazion/i.test(haystack)) {
    return { name: 'play', bg: colors.accentSoft, fg: colors.accentPressed };
  }
  if (/attenzion|ambig|ipotes|contesto/i.test(haystack)) {
    return { name: 'attention', bg: colors.accentSoft, fg: colors.accentPressed };
  }
  if (/rilass|ripos|relax/i.test(haystack)) {
    return { name: 'moon', bg: colors.accentSoft, fg: colors.accentPressed };
  }
  return { name: 'paw', bg: colors.accentSoft, fg: colors.accentPressed };
}

function StatusBadgeView({ badge }: { badge: StatusBadge }) {
  return (
    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
      <CuteIcon name={badge.icon} size={14} color={badge.fg} secondary={badge.bg} />
      <Text style={[styles.statusBadgeText, { color: badge.fg }]}>{badge.label}</Text>
    </View>
  );
}

/**
 * Copertina 16:9 della card: la logica media (digestive illustrata, video
 * per-piattaforma, foto con fallback) vive in DiaryMediaCover.
 */
function DiaryCard({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const badge = entryStatusBadge(entry);
  const icon = entryIconTone(entry);

  const meta = (
    <View style={styles.metaRow}>
      <Text style={styles.rowTime}>{timeLabel(entry.occurredAt)}</Text>
      <View style={styles.metaSpacer} />
      {badge ? <StatusBadgeView badge={badge} /> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} />
    </View>
  );

  const deleted = entry.mediaDeleted ? (
    <View style={styles.deletedRow}>
      <Ionicons name="trash-bin-outline" size={12} color={colors.iconMuted} />
      <Text style={styles.deletedText}>Video non più disponibile</Text>
    </View>
  ) : null;

  const cardAccessibilityLabel = `${entry.title}, ${timeLabel(entry.occurredAt)}`;

  if (entry.domain === 'DIGESTIVE' || entry.mediaUri) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cardAccessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.mediaCard, pressed && styles.entryCardPressed]}
      >
        <View style={styles.mediaTop}>
          <DiaryMediaCover entry={entry} badgeLabel={badge?.label ?? null} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.rowTitle}>{entry.title}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {entry.subtitle ?? (entry.domain === 'BEHAVIOR' ? 'Un momento osservato insieme.' : 'Un controllo da seguire nel tempo.')}
          </Text>
          {meta}
          {deleted}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.plainCard, pressed && styles.entryCardPressed]}
    >
      <View style={[styles.iconBlock, { backgroundColor: icon.bg }]}>
        <CuteIcon name={icon.name} size={26} color={icon.fg} secondary={colors.text} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={2}>
          {entry.subtitle ?? (entry.domain === 'BEHAVIOR' ? 'Un momento osservato insieme.' : 'Un controllo da seguire nel tempo.')}
        </Text>
        {meta}
        {deleted}
      </View>
    </Pressable>
  );
}

function SoftState({
  title,
  message,
  actionLabel,
  onAction,
  loading,
  mood = 'welcome',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  mood?: 'welcome' | 'thinking' | 'resting';
}) {
  return (
    <View style={styles.stateWrap}>
      {loading ? (
        <View style={styles.stateCircle}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <DogIllustration size={150} mood={mood} />
      )}
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
  const reducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<DiaryFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;

  const query = useInfiniteQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dog.id), filter, debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchDiaryPage({
        dogId: dog.id,
        domain: filter === 'ALL' ? undefined : filter,
        cursor: pageParam,
        limit: 20,
        q: debouncedSearch || undefined,
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
    const term = debouncedSearch.toLocaleLowerCase('it-IT');
    if (!term) return source;
    return source.filter((entry) =>
      `${entry.title} ${entry.subtitle ?? ''}`
        .toLocaleLowerCase('it-IT')
        .includes(term),
    );
  }, [query.data, debouncedSearch]);

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
          <Text style={styles.title}>Il diario di {dog.name}</Text>
          <Text style={styles.subtitle}>
            La storia delle sue giornate, una pagina alla volta.
          </Text>

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.iconMuted} />
            <TextInput
              accessibilityLabel="Cerca nel diario"
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca una storia, un momento…"
              placeholderTextColor={colors.iconMuted}
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
                <Ionicons name="close-circle" size={18} color={colors.iconMuted} />
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
              title="Sfoglio il diario…"
              message={`Sto raccogliendo le giornate di ${dog.name}.`}
            />
          ) : realEnabled && query.isError ? (
            <SoftState
              mood="thinking"
              title="Ops, mi sono perso un attimo"
              message="Non trovo le pagine del diario. Controlla la connessione e riprovo."
              actionLabel="Riprova"
              onAction={() => void query.refetch()}
            />
          ) : groups.length === 0 ? (
            <SoftState
              mood={debouncedSearch ? 'thinking' : 'welcome'}
              title={
                debouncedSearch
                  ? 'Nessuna storia trovata'
                  : filter === 'ALL'
                    ? `Il diario di ${dog.name} aspetta la prima storia`
                    : filter === 'BEHAVIOR'
                      ? 'Nessun momento osservato, per ora'
                      : 'Nessun controllo digestione nel diario'
              }
              message={
                debouncedSearch
                  ? 'Prova con un’altra parola, oppure cancella la ricerca.'
                  : filter === 'DIGESTIVE'
                    ? `In chat possiamo guardare insieme la digestione di ${dog.name}: qui resterà il riassunto.`
                    : filter === 'BEHAVIOR'
                      ? `In chat mandami un video di ${dog.name}: qui resterà il momento, in parole semplici.`
                      : `Parliamone in chat: i momenti di ${dog.name} resteranno qui, leggeri.`
              }
              actionLabel={
                debouncedSearch
                  ? undefined
                  : filter === 'DIGESTIVE'
                    ? 'Apri la chat'
                    : 'Apri la chat'
              }
              onAction={
                debouncedSearch
                  ? undefined
                  : () =>
                      router.push({
                        pathname: '/ask',
                        params:
                          filter === 'DIGESTIVE' ? { intent: 'digest' } : {},
                      } as never)
              }
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
              renderItem={({ item, index }) => {
                const entering =
                  reducedMotion || index >= ENTRANCE_ITEMS
                    ? undefined
                    : FadeInDown.duration(300).delay(index * 60);
                if (item.kind === 'header') {
                  return (
                    <Animated.View entering={entering}>
                      <View style={styles.groupHeader} accessibilityRole="header">
                        <Text style={styles.groupLabel}>
                          {dayLabel(item.current)}
                        </Text>
                        <CuteIcon
                          name="paw"
                          size={15}
                          color={colors.accent}
                          secondary={colors.accentSoft}
                        />
                      </View>
                    </Animated.View>
                  );
                }
                const { entry } = item;
                return (
                  <Animated.View entering={entering}>
                    <DiaryCard
                      entry={entry}
                      onPress={() =>
                        router.push({
                          pathname: '/ask',
                          params: {
                            eventId: entry.id,
                            source:
                              entry.domain === 'DIGESTIVE'
                                ? 'digestive'
                                : 'behavior',
                            intent: 'revisit',
                          },
                        } as never)
                      }
                    />
                  </Animated.View>
                );
              }}
              ListFooterComponent={
                realEnabled ? (
                  query.isFetchingNextPage ? (
                    <Text style={styles.endNote}>Sfoglio altre pagine…</Text>
                  ) : !query.hasNextPage ? (
                    <Text style={styles.endNote}>
                      Hai ripercorso tutta la sua storia.
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
    backgroundColor: colors.background,
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
    paddingTop: spacing.sm,
  },
  title: {
    marginTop: spacing.sm,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.regular,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
  },
  filtersScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterPill: {
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: 18,
    backgroundColor: colors.surfaceMuted,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
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
    marginHorizontal: -20,
  },
  timelineContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  groupLabel: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  mediaCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  mediaTop: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceMuted,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  plainCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  iconBlock: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  entryCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  metaSpacer: {
    flex: 1,
  },
  rowTime: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.regular,
    color: colors.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  deletedText: {
    fontSize: 11,
    color: colors.iconMuted,
    fontStyle: 'italic',
  },
  endNote: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
    gap: spacing.md,
  },
  stateCircle: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stateTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateAction: {
    marginTop: spacing.sm,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: 22,
    backgroundColor: colors.accent,
  },
  stateActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  stateActionLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.textOnPrimary,
  },
});

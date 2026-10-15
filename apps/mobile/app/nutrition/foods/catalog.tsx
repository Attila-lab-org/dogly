import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  browseFoodCatalog,
  type FoodCatalogItem,
} from '@/features/nutrition/api';
import {
  FoodShelfCard,
  useShelfCardWidth,
} from '@/features/nutrition/FoodShelfCard';
import { scheduleCatalogSearch } from '@/features/nutrition/catalogSearch';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tutti' },
  { value: 'crocchette', label: 'Crocchette' },
  { value: 'umido', label: 'Umido' },
  { value: 'snack', label: 'Snack' },
];

export default function FoodCatalogScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const cardWidth = useShelfCardWidth();
  const [query, setQuery] = useState('');
  const [foodForm, setFoodForm] = useState('');
  const [items, setItems] = useState<FoodCatalogItem[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const cleaned = query.trim();
    return scheduleCatalogSearch(
      () =>
        browseFoodCatalog({
          dogId: dog.id,
          query: cleaned,
          foodForm,
          pageSize: 40,
        }),
      (result) => {
        setItems(result.items);
        setNextPage(result.next_page);
      },
      () => setError('Non riesco a caricare il catalogo.'),
      () => setLoading(false),
    );
  }, [dog.id, foodForm, query]);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Catalogo" />
      <Text style={styles.hero}>Il cibo di {dog.name}</Text>
      <Text style={styles.lead}>
        Cerca per marca o nome, oppure scegli dallo scaffale. Un tap e confermi.
      </Text>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Cerca per nome o marca"
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca marca o nome…"
          placeholderTextColor={colors.textMuted}
          autoFocus
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pulisci ricerca"
            onPress={() => setQuery('')}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((filter) => {
          const selected = foodForm === filter.value;
          return (
            <Pressable
              key={filter.value || 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFoodForm(filter.value)}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.count} accessibilityLiveRegion="polite">
        {loading
          ? query.trim()
            ? `Cerco “${query.trim()}”…`
            : 'Carico lo scaffale…'
          : query.trim()
            ? items.length === 0
              ? `Nessun risultato per “${query.trim()}”`
              : `${items.length} risultat${items.length === 1 ? 'o' : 'i'}`
            : items.length === 0
              ? 'Catalogo vuoto al momento'
              : 'Tra i più usati'}
      </Text>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.emptyBody}>
            {query.trim()
              ? 'Sto cercando nel catalogo…'
              : 'Sto caricando i prodotti più usati…'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Catalogo non raggiungibile</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Text style={styles.emptyBody}>
            Puoi riprovare tra poco oppure aggiungere il cibo con una foto del fronte.
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name={query.trim() ? 'search-outline' : 'file-tray-outline'}
            size={28}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {query.trim() ? 'Non c’è in catalogo' : 'Niente da mostrare qui'}
          </Text>
          <Text style={styles.emptyBody}>
            {query.trim()
              ? 'Prova la marca completa, togli filtri, oppure fotografa il fronte della confezione (marca e nome).'
              : 'Cerca per nome oppure aggiungi il cibo con una foto del fronte.'}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <FoodShelfCard
              key={item.barcode || `${item.brand}-${item.name}`}
              item={item}
              width={cardWidth}
              onPress={() =>
                router.push({
                  pathname: '/nutrition/foods/new',
                  params: {
                    catalogBarcode: item.barcode || '',
                    photoQuery: item.name || item.brand || '',
                  },
                } as never)
              }
            />
          ))}
        </View>
      )}

      {nextPage ? (
        <Button
          title="Mostra altri"
          loading={loadingMore}
          variant="outline"
          onPress={() => {
            setLoadingMore(true);
            void browseFoodCatalog({
              dogId: dog.id,
              query: query.trim(),
              foodForm,
              page: nextPage,
              pageSize: 40,
            })
              .then((result) => {
                setItems((current) => [...current, ...result.items]);
                setNextPage(result.next_page);
              })
              .finally(() => setLoadingMore(false));
          }}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/nutrition/foods/scan' as never)}
        style={styles.photoFallback}
      >
        <Ionicons name="camera-outline" size={18} color={colors.primary} />
        <Text style={styles.photoFallbackText}>
          Non c’è? Foto del fronte (marca e nome)
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.4,
  },
  lead: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.35,
    marginTop: -4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
    paddingVertical: 12,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
  },
  chipTextActive: { color: '#FFFFFF' },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
    maxWidth: 260,
  },
  photoFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  photoFallbackText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  error: { color: colors.danger },
});

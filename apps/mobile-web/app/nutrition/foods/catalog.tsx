import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  const [query, setQuery] = useState('');
  const [foodForm, setFoodForm] = useState('');
  const [sortAlpha, setSortAlpha] = useState(false);
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
      () => browseFoodCatalog({ dogId: dog.id, query: cleaned, foodForm }),
      (result) => {
        setItems(result.items);
        setNextPage(result.next_page);
      },
      () => setError('Non riesco a caricare il catalogo.'),
      () => setLoading(false),
    );
  }, [dog.id, foodForm, query]);

  const visible = sortAlpha
    ? [...items].sort((a, b) =>
        `${a.brand ?? ''} ${a.name ?? ''}`.localeCompare(
          `${b.brand ?? ''} ${b.name ?? ''}`,
          'it',
        ),
      )
    : items;

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Catalogo alimenti" />
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Cerca per nome o marca"
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome o marca…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
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
        <Pressable
          accessibilityRole="button"
          onPress={() => setSortAlpha((value) => !value)}
          style={[styles.chip, sortAlpha && styles.chipActive]}
        >
          <Ionicons
            name="swap-vertical-outline"
            size={14}
            color={sortAlpha ? '#FFFFFF' : colors.textSecondary}
          />
          <Text style={[styles.chipText, sortAlpha && styles.chipTextActive]}>Ordina</Text>
        </Pressable>
      </View>

      <Text style={styles.count}>
        {loading ? 'Cerco…' : `Risultati (${visible.length}${nextPage ? '+' : ''})`}
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.list}>
          {visible.map((item) => (
            <Pressable
              key={item.barcode || `${item.brand}-${item.name}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/nutrition/foods/new',
                  params: { photoQuery: item.name || item.brand || '' },
                } as never)
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.image} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="nutrition-outline" size={22} color={colors.accent} />
                </View>
              )}
              <View style={styles.copy}>
                <Text style={styles.brand}>{item.brand || 'Marca'}</Text>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name || 'Prodotto'}
                </Text>
                <Text style={styles.meta}>
                  {[item.package_size, item.food_form].filter(Boolean).join(' · ') || 'Dal catalogo'}
                </Text>
              </View>
              <View style={styles.add}>
                <Ionicons name="add" size={22} color={colors.textOnPrimary} />
              </View>
            </Pressable>
          ))}
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
                })
                  .then((result) => {
                    setItems((current) => [...current, ...result.items]);
                    setNextPage(result.next_page);
                  })
                  .finally(() => setLoadingMore(false));
              }}
            />
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: typography.size.md, paddingVertical: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  count: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  imagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  brand: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 12 },
  add: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.82 },
  error: { color: colors.danger },
});

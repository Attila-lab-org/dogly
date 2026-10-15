import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, ScreenContainer } from '@/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  activateFeedingPeriod,
  browseFoodCatalog,
  createNutritionOperationId,
  confirmExternalFood,
  createManualFood,
  getFood,
  lookupFoodByBarcode,
  searchFoodsByName,
  verifyFood,
  type ExternalFoodCandidate,
} from '@/features/nutrition/api';
import {
  FoodShelfCard,
  useShelfCardWidth,
} from '@/features/nutrition/FoodShelfCard';
import { StackScreenHeader } from '@/features/secondary/components';
import { scheduleCatalogSearch } from '@/features/nutrition/catalogSearch';
import { queryKeys } from '@/lib/queryClient';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Step = 'identify' | 'details';

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tutti' },
  { value: 'crocchette', label: 'Crocchette' },
  { value: 'umido', label: 'Umido' },
  { value: 'snack', label: 'Snack' },
];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export default function NewFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    photoFoodId?: string | string[];
    photoQuery?: string | string[];
    catalogBarcode?: string | string[];
  }>();
  const photoFoodId = firstParam(params.photoFoodId);
  const photoQuery = firstParam(params.photoQuery);
  const catalogBarcode = firstParam(params.catalogBarcode);
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const cardWidth = useShelfCardWidth();
  const photoStarted = useRef(false);
  const catalogPickStarted = useRef(false);
  const feedingOperationIdRef = useRef<string | null>(null);

  const [step, setStep] = useState<Step>('identify');
  const [query, setQuery] = useState(photoQuery);
  const [hits, setHits] = useState<ExternalFoodCandidate[]>([]);
  const [selected, setSelected] = useState<ExternalFoodCandidate | null>(null);
  const [manual, setManual] = useState(false);
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [activeNow, setActiveNow] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [treats, setTreats] = useState('');
  const [transition, setTransition] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ExternalFoodCandidate | null>(null);
  const [foodForm, setFoodForm] = useState('');
  const [catalogNextPage, setCatalogNextPage] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const photoFoodQuery = useQuery({
    queryKey: ['nutrition-photo-food', photoFoodId],
    queryFn: () => getFood(photoFoodId),
    enabled: Boolean(photoFoodId),
  });

  useEffect(() => {
    const cleaned = query.trim();
    setMessage(null);
    setSearching(false);
    if (step !== 'identify' || !cleaned || !dog.id || catalogBarcode) return;
    setHits([]);
    setCatalogNextPage(null);
    setSearching(true);
    return scheduleCatalogSearch(
      () => searchFoodsByName({ dogId: dog.id, query: cleaned }),
      (result) => {
        setHits(result.items);
        setCatalogNextPage(null);
        if (!result.items.length) {
          setMessage(
            `Nessun risultato per “${cleaned}”. Prova la marca completa oppure fotografa la confezione.`,
          );
        }
      },
      () => {
        setMessage(
          'Il catalogo non è raggiungibile adesso. Puoi usare una foto o inserire il nome.',
        );
      },
      () => setSearching(false),
    );
  }, [catalogBarcode, dog.id, query, step]);

  useEffect(() => {
    if (step !== 'identify' || query.trim() || !dog.id || catalogBarcode) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogNextPage(null);
    void browseFoodCatalog({ dogId: dog.id, foodForm, pageSize: 40 })
      .then((result) => {
        if (!active) return;
        setHits(result.items.map((item) => ({ ...item, lookup_id: '' })));
        setCatalogNextPage(result.next_page);
      })
      .catch(() => {
        if (active) {
          setMessage(
            'Il catalogo non è raggiungibile adesso. Puoi cercare per nome, usare una foto o inserire il nome.',
          );
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [catalogBarcode, dog.id, foodForm, query, step]);

  useEffect(() => {
    if (!photoFoodId || photoStarted.current || photoFoodQuery.isLoading) return;
    photoStarted.current = true;
    const food = photoFoodQuery.data;
    const extractedQuery =
      photoQuery || [food?.brand, food?.name].filter(Boolean).join(' ');
    setBrand(food?.brand ?? '');
    setName(food?.name ?? '');
    setQuery(extractedQuery);
    if (extractedQuery.trim().length >= 2) {
      setStep('identify');
    } else {
      setManual(true);
      setStep('details');
      setMessage('Non ho letto abbastanza bene marca e nome. Completa solo questi due campi.');
    }
  }, [photoFoodId, photoFoodQuery.data, photoFoodQuery.isLoading, photoQuery]);

  const choose = (item: ExternalFoodCandidate) => {
    setSelected(item);
    setManual(false);
    setBrand(item.brand ?? '');
    setName(item.name ?? '');
    setStep('details');
    setMessage(null);
  };

  useEffect(() => {
    if (!catalogBarcode || catalogPickStarted.current || !dog.id) return;
    catalogPickStarted.current = true;
    let active = true;
    setWorking(true);
    setMessage(null);
    void lookupFoodByBarcode({ dogId: dog.id, barcode: catalogBarcode })
      .then((exact) => {
        if (!active) return;
        setSelected(exact);
        setManual(false);
        setBrand(exact.brand ?? '');
        setName(exact.name ?? '');
        setStep('details');
        setMessage(null);
      })
      .catch(() => {
        if (!active) return;
        setMessage(
          'Non trovo più questo prodotto. Cerca per nome o fotografa la confezione.',
        );
        setStep('identify');
      })
      .finally(() => {
        if (active) setWorking(false);
      });
    return () => {
      active = false;
    };
  }, [catalogBarcode, dog.id]);

  const startManual = () => {
    setSelected(null);
    setManual(true);
    setBrand(photoFoodQuery.data?.brand ?? '');
    setName(photoFoodQuery.data?.name ?? query.trim());
    setStep('details');
    setMessage(null);
  };

  const save = async () => {
    if (!name.trim() || working) return;
    if (photoFoodId && !brand.trim()) {
      setMessage('Scrivi la marca riportata sulla confezione.');
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      let food;
      const chosen = selected && !selected.lookup_id
        ? await lookupFoodByBarcode({ dogId: dog.id, barcode: selected.barcode })
        : selected;
      if (photoFoodId && chosen) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: chosen.lookup_id,
          draftFoodId: photoFoodId,
          brand,
          name,
          ingredientsRaw: chosen.ingredients_raw ?? undefined,
          calories: chosen.calories ?? undefined,
          guaranteedAnalysis: chosen.guaranteed_analysis,
          activate: false,
        });
      } else if (photoFoodId) {
        const draft = photoFoodQuery.data;
        const analysis = draft?.guaranteed_analysis;
        food = await verifyFood({
          foodId: photoFoodId,
          brand: brand.trim(),
          name: name.trim(),
          ingredientsRaw:
            chosen?.ingredients_raw ?? draft?.ingredients_raw ?? '',
          protein: analysis?.crude_protein_min?.toString() ?? '',
          fat: analysis?.crude_fat_min?.toString() ?? '',
          fiber: analysis?.crude_fiber_max?.toString() ?? '',
          moisture: analysis?.moisture_max?.toString() ?? '',
          calories: chosen?.calories ?? analysis?.calories ?? '',
          feedingDirections: draft?.feeding_directions ?? '',
        });
      } else if (chosen) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: chosen.lookup_id,
          brand,
          name,
          ingredientsRaw: chosen.ingredients_raw ?? undefined,
          calories: chosen.calories ?? undefined,
          guaranteedAnalysis: chosen.guaranteed_analysis,
          activate: false,
        });
      } else {
        food = await createManualFood({ dogId: dog.id, brand, name });
      }
      if (activeNow) {
        const operationId =
          feedingOperationIdRef.current ?? createNutritionOperationId('feed-activate');
        feedingOperationIdRef.current = operationId;
        await activateFeedingPeriod({
          dogId: dog.id,
          foodId: food.id,
          quantityPerDay: quantity,
          treatsNotes: treats,
          transitionNotes: transition,
          operationId,
        });
      }
      feedingOperationIdRef.current = null;
      if (userId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.foods(userId, dog.id),
        });
      }
      router.replace('/nutrition/foods');
    } catch {
      setMessage('Non sono riuscito a salvare. Riprova.');
    } finally {
      setWorking(false);
    }
  };

  const selectedMeta = selected ? uniqueProductMeta(selected) : [];

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />

      {step === 'identify' ? (
        <>
          <Text style={styles.hero}>Il cibo di {dog.name}</Text>
          <Text style={styles.lead}>
            Cerca o scegli tra i più usati. Un tap e confermi.
          </Text>

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={20} color={colors.textMuted} />
            <TextInput
              accessibilityLabel="Marca o nome dell’alimento"
              value={query}
              onChangeText={setQuery}
              placeholder="Cerca marca o nome…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoFocus={!catalogBarcode && !photoFoodId}
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
              const selectedFilter = foodForm === filter.value;
              return (
                <Pressable
                  key={filter.value || 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedFilter }}
                  onPress={() => setFoodForm(filter.value)}
                  style={[styles.chip, selectedFilter && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selectedFilter && styles.chipTextActive]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.count}>
            {searching
              ? 'Cerco nel catalogo…'
              : catalogLoading
                ? 'Carico lo scaffale…'
                : query.trim()
                  ? `${hits.length} risultat${hits.length === 1 ? 'o' : 'i'}`
                  : 'Tra i più usati'}
          </Text>

          {hits.length > 0 ? (
            <View style={styles.grid}>
              {hits.map((item) => (
                <FoodShelfCard
                  key={item.lookup_id || item.barcode || `${item.brand}-${item.name}`}
                  item={item}
                  width={cardWidth}
                  onPress={() => choose(item)}
                />
              ))}
            </View>
          ) : null}

          {!query.trim() && catalogNextPage ? (
            <Button
              title="Mostra altri"
              loading={catalogLoading}
              variant="outline"
              onPress={() => {
                setCatalogLoading(true);
                void browseFoodCatalog({
                  dogId: dog.id,
                  foodForm,
                  page: catalogNextPage,
                  pageSize: 40,
                })
                  .then((result) => {
                    setHits((current) => [
                      ...current,
                      ...result.items.map((item) => ({ ...item, lookup_id: '' })),
                    ]);
                    setCatalogNextPage(result.next_page);
                  })
                  .catch(() => setMessage('Non riesco a caricare altri alimenti adesso.'))
                  .finally(() => setCatalogLoading(false));
              }}
            />
          ) : null}

          <View style={styles.fallbackBlock}>
            <Text style={styles.or}>Non lo trovi?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/nutrition/foods/scan')}
              style={styles.photoCta}
            >
              <View style={styles.photoIcon}>
                <Ionicons name="camera-outline" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoTitle}>Fotografa la confezione</Text>
                <Text style={styles.photoSub}>Solo se non è in catalogo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={startManual}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>Inseriscilo a mano</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {step === 'details' ? (
        <>
          <Text style={styles.confirmEyebrow}>
            {manual ? 'Inserimento' : 'Conferma'}
          </Text>
          <Text style={styles.hero}>
            {manual ? 'Inserisci l’alimento' : 'È questo?'}
          </Text>

          {selected && !manual ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anteprima prodotto"
              onPress={() => setPreviewItem(selected)}
              style={styles.heroPack}
            >
              {selected.image_url ? (
                <Image source={{ uri: selected.image_url }} style={styles.heroImage} />
              ) : (
                <LinearGradient
                  colors={['#CCFBF1', '#DBEAFE']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroFallback}
                >
                  <Ionicons name="nutrition-outline" size={56} color={colors.accent} />
                </LinearGradient>
              )}
              <View style={styles.heroInfo}>
                {selected.brand ? (
                  <Text style={styles.heroBrand}>{selected.brand}</Text>
                ) : null}
                <Text style={styles.heroName}>{selected.name}</Text>
                {selectedMeta.length > 0 ? (
                  <Text style={styles.heroMeta}>{selectedMeta.join(' · ')}</Text>
                ) : null}
                <Text style={styles.heroPeek}>Dettagli prodotto ›</Text>
              </View>
            </Pressable>
          ) : null}

          {manual ? (
            <View style={styles.manualFields}>
              <Text style={styles.fieldLabel}>Marca</Text>
              <TextInput
                accessibilityLabel="Marca"
                value={brand}
                onChangeText={setBrand}
                placeholder="Per esempio: Monge"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Nome completo</Text>
              <TextInput
                accessibilityLabel="Nome completo dell’alimento"
                value={name}
                onChangeText={setName}
                placeholder="Come scritto sulla confezione"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          ) : null}

          {!manual ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('identify')}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>Scegli un altro alimento</Text>
            </Pressable>
          ) : null}

          <View style={styles.currentRow}>
            <View style={styles.currentCopy}>
              <Text style={styles.currentTitle}>È il cibo di adesso</Text>
              <Text style={styles.currentHint}>
                Così Dogly lo collega alle prossime osservazioni.
              </Text>
            </View>
            <Switch
              value={activeNow}
              onValueChange={setActiveNow}
              accessibilityLabel="È il cibo attuale"
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={activeNow ? colors.accent : colors.textMuted}
            />
          </View>

          {activeNow ? (
            <>
              <Text style={styles.fieldLabel}>
                Quanto ne mangia al giorno?{' '}
                <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Quantità giornaliera"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Per esempio: 280 g"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setMoreOpen((value) => !value)}
                style={styles.moreButton}
              >
                <Text style={styles.textActionLabel}>
                  {moreOpen ? 'Nascondi altri dettagli' : 'Aggiungi snack o cambio recente'}
                </Text>
                <Ionicons
                  name={moreOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.primary}
                />
              </Pressable>
              {moreOpen ? (
                <>
                  <TextInput
                    accessibilityLabel="Snack o extra abituali"
                    value={treats}
                    onChangeText={setTreats}
                    placeholder="Snack o extra abituali"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <TextInput
                    accessibilityLabel="Cambio recente"
                    value={transition}
                    onChangeText={setTransition}
                    placeholder="Cambio recente, se c’è stato"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </>
              ) : null}
            </>
          ) : null}

          <Button
            title={manual ? `Salva per ${dog.name}` : `Sì, è questo · Salva`}
            loading={working}
            disabled={!name.trim()}
            onPress={() => void save()}
          />
        </>
      ) : null}

      {working && step === 'identify' ? (
        <Text style={styles.status}>Sto caricando il prodotto…</Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Modal
        visible={Boolean(previewItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewItem(null)}>
          <Pressable
            style={styles.previewCard}
            onPress={(event) => event.stopPropagation()}
          >
            {previewItem?.image_url ? (
              <Image source={{ uri: previewItem.image_url }} style={styles.previewImage} />
            ) : null}
            <Text style={styles.previewBrand}>{previewItem?.brand}</Text>
            <Text style={styles.previewName}>{previewItem?.name}</Text>
            {previewItem && uniqueProductMeta(previewItem).length > 0 ? (
              <Text style={styles.productMeta}>
                {uniqueProductMeta(previewItem).join(' · ')}
              </Text>
            ) : null}
            {previewItem?.attribution ? (
              <Text style={styles.productMeta}>Fonte: Open Pet Food Facts</Text>
            ) : null}
            {previewItem?.ingredients_raw ? (
              <View style={styles.previewAnalysis}>
                <Text style={styles.previewAnalysisTitle}>Ingredienti</Text>
                <Text style={styles.previewBody}>{previewItem.ingredients_raw}</Text>
              </View>
            ) : null}
            {previewItem?.guaranteed_analysis &&
            Object.keys(previewItem.guaranteed_analysis).length > 0 ? (
              <View style={styles.previewAnalysis}>
                <Text style={styles.previewAnalysisTitle}>Informazioni del prodotto</Text>
                {previewItem.guaranteed_analysis.crude_protein_min != null ? (
                  <Text style={styles.previewBody}>
                    Proteine {previewItem.guaranteed_analysis.crude_protein_min}%
                  </Text>
                ) : null}
                {previewItem.guaranteed_analysis.crude_fat_min != null ? (
                  <Text style={styles.previewBody}>
                    Grassi {previewItem.guaranteed_analysis.crude_fat_min}%
                  </Text>
                ) : null}
                {previewItem.guaranteed_analysis.crude_fiber_max != null ? (
                  <Text style={styles.previewBody}>
                    Fibre {previewItem.guaranteed_analysis.crude_fiber_max}%
                  </Text>
                ) : null}
                {previewItem.guaranteed_analysis.moisture_max != null ? (
                  <Text style={styles.previewBody}>
                    Umidità {previewItem.guaranteed_analysis.moisture_max}%
                  </Text>
                ) : null}
                {(previewItem.guaranteed_analysis.calories ?? previewItem.calories) ? (
                  <Text style={styles.previewBody}>
                    Calorie{' '}
                    {previewItem.guaranteed_analysis.calories ?? previewItem.calories}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Button title="Chiudi" variant="outline" onPress={() => setPreviewItem(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function uniqueProductMeta(item: ExternalFoodCandidate): string[] {
  const seen = new Set<string>();
  return [item.variant, item.package_size, item.food_form]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => {
      const key = value.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.4,
  },
  confirmEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  fallbackBlock: { gap: spacing.sm, marginTop: spacing.sm },
  or: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  photoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  photoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  photoTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  photoSub: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
  textAction: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  textActionLabel: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  heroPack: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 1.05,
    backgroundColor: colors.surfaceMuted,
  },
  heroFallback: {
    width: '100%',
    aspectRatio: 1.05,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: {
    padding: spacing.lg,
    gap: 4,
  },
  heroBrand: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroName: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    lineHeight: typography.size.xl * 1.25,
  },
  heroMeta: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    marginTop: 2,
  },
  heroPeek: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    marginTop: 8,
  },
  manualFields: { gap: spacing.sm },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  optional: {
    color: colors.textSecondary,
    fontWeight: typography.weight.regular,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  currentCopy: { flex: 1 },
  currentTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  currentHint: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  status: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  previewBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(15,35,65,0.48)',
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  previewBrand: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
  },
  previewName: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  productMeta: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  previewAnalysis: {
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  previewAnalysisTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  previewBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
  },
});

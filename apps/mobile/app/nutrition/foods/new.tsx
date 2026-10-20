import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SpringPress } from '@/components/pressSpring';
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
import { hasMealNutrition, needsLabelEnrichment } from '@/features/nutrition/label';
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
    photoLocalUri?: string | string[];
    catalogBarcode?: string | string[];
  }>();
  const photoFoodId = firstParam(params.photoFoodId);
  const photoQuery = firstParam(params.photoQuery);
  const photoLocalUri = firstParam(params.photoLocalUri);
  const catalogBarcode = firstParam(params.catalogBarcode);
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const cardWidth = useShelfCardWidth();
  const photoStarted = useRef(false);
  const catalogPickStarted = useRef(false);
  const feedingOperationIdRef = useRef<string | null>(null);

  const [step, setStep] = useState<Step>(photoFoodId ? 'details' : 'identify');
  const [query, setQuery] = useState(photoQuery);
  const [hits, setHits] = useState<ExternalFoodCandidate[]>([]);
  const [selected, setSelected] = useState<ExternalFoodCandidate | null>(null);
  const [manual, setManual] = useState(Boolean(photoFoodId));
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
  const [ingredients, setIngredients] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [moisture, setMoisture] = useState('');
  const [caloriesLabel, setCaloriesLabel] = useState('');
  const [manualNutritionOpen, setManualNutritionOpen] = useState(false);

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
    const nextBrand = (food?.brand ?? '').trim();
    const nextName = (food?.name ?? '').trim();
    const extractedQuery =
      photoQuery || [nextBrand, nextName].filter(Boolean).join(' ');
    setBrand(nextBrand);
    setName(nextName || extractedQuery);
    setQuery(extractedQuery);
    setSelected(null);
    setManual(true);
    setStep('details');
    setIngredients(food?.ingredients_raw ?? '');
    setProtein(food?.guaranteed_analysis?.crude_protein_min?.toString() ?? '');
    setFat(food?.guaranteed_analysis?.crude_fat_min?.toString() ?? '');
    setFiber(food?.guaranteed_analysis?.crude_fiber_max?.toString() ?? '');
    setMoisture(food?.guaranteed_analysis?.moisture_max?.toString() ?? '');
    setCaloriesLabel(food?.guaranteed_analysis?.calories ?? '');
    setManualNutritionOpen(needsLabelEnrichment(food ?? {}));
    if (nextBrand && nextName) {
      setMessage('Ho letto marca e nome dalla foto. Controlla e salva.');
    } else {
      setMessage(
        'Ho la tua foto. Completa solo marca e nome se mancano, poi salva.',
      );
    }
  }, [photoFoodId, photoFoodQuery.data, photoFoodQuery.isLoading, photoQuery]);

  const choose = (item: ExternalFoodCandidate) => {
    setSelected(item);
    setManual(false);
    setBrand(item.brand ?? '');
    setName(item.name ?? '');
    setIngredients(item.ingredients_raw ?? '');
    setProtein(item.guaranteed_analysis?.crude_protein_min?.toString() ?? '');
    setFat(item.guaranteed_analysis?.crude_fat_min?.toString() ?? '');
    setFiber(item.guaranteed_analysis?.crude_fiber_max?.toString() ?? '');
    setMoisture(item.guaranteed_analysis?.moisture_max?.toString() ?? '');
    setCaloriesLabel(item.calories ?? item.guaranteed_analysis?.calories ?? '');
    setManualNutritionOpen(needsLabelEnrichment(item));
    setStep('details');
    setMessage(null);
  };

  const goEnrichPhoto = () => {
    router.push({
      pathname: '/nutrition/foods/scan' as never,
      params: {
        enrich: '1',
        catalogBarcode: selected?.barcode || '',
        lookupId: selected?.lookup_id || '',
        brand,
        name,
      },
    });
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
        setIngredients(exact.ingredients_raw ?? '');
        setProtein(exact.guaranteed_analysis?.crude_protein_min?.toString() ?? '');
        setFat(exact.guaranteed_analysis?.crude_fat_min?.toString() ?? '');
        setFiber(exact.guaranteed_analysis?.crude_fiber_max?.toString() ?? '');
        setMoisture(exact.guaranteed_analysis?.moisture_max?.toString() ?? '');
        setCaloriesLabel(
          exact.calories ?? exact.guaranteed_analysis?.calories ?? '',
        );
        setManualNutritionOpen(needsLabelEnrichment(exact));
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
    const draft = photoFoodQuery.data;
    setBrand(draft?.brand ?? '');
    setName(draft?.name ?? query.trim());
    setIngredients(draft?.ingredients_raw ?? '');
    setProtein(draft?.guaranteed_analysis?.crude_protein_min?.toString() ?? '');
    setFat(draft?.guaranteed_analysis?.crude_fat_min?.toString() ?? '');
    setFiber(draft?.guaranteed_analysis?.crude_fiber_max?.toString() ?? '');
    setMoisture(draft?.guaranteed_analysis?.moisture_max?.toString() ?? '');
    setCaloriesLabel(draft?.guaranteed_analysis?.calories ?? '');
    setManualNutritionOpen(true);
    setStep('details');
    setMessage(null);
  };

  const parsePct = (value: string): number | undefined => {
    if (!value.trim()) return undefined;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const nutritionFromForm = () => ({
    ingredients_raw: ingredients.trim() || null,
    guaranteed_analysis: {
      crude_protein_min: parsePct(protein) ?? null,
      crude_fat_min: parsePct(fat) ?? null,
      crude_fiber_max: parsePct(fiber) ?? null,
      moisture_max: parsePct(moisture) ?? null,
      calories: caloriesLabel.trim() || null,
    },
  });

  const mealReady = (): boolean => {
    if (hasMealNutrition(nutritionFromForm())) return true;
    if (selected && hasMealNutrition(selected)) return true;
    if (photoFoodQuery.data && hasMealNutrition(photoFoodQuery.data)) return true;
    return false;
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
      const formNutrition = nutritionFromForm();
      const draft = photoFoodQuery.data;
      const ingredientsRaw =
        formNutrition.ingredients_raw ||
        chosen?.ingredients_raw ||
        draft?.ingredients_raw ||
        undefined;
      const guaranteedAnalysis = {
        crude_protein_min:
          formNutrition.guaranteed_analysis.crude_protein_min ??
          chosen?.guaranteed_analysis?.crude_protein_min ??
          draft?.guaranteed_analysis?.crude_protein_min ??
          undefined,
        crude_fat_min:
          formNutrition.guaranteed_analysis.crude_fat_min ??
          chosen?.guaranteed_analysis?.crude_fat_min ??
          draft?.guaranteed_analysis?.crude_fat_min ??
          undefined,
        crude_fiber_max:
          formNutrition.guaranteed_analysis.crude_fiber_max ??
          chosen?.guaranteed_analysis?.crude_fiber_max ??
          draft?.guaranteed_analysis?.crude_fiber_max ??
          undefined,
        moisture_max:
          formNutrition.guaranteed_analysis.moisture_max ??
          chosen?.guaranteed_analysis?.moisture_max ??
          draft?.guaranteed_analysis?.moisture_max ??
          undefined,
        calories:
          formNutrition.guaranteed_analysis.calories ||
          chosen?.calories ||
          chosen?.guaranteed_analysis?.calories ||
          draft?.guaranteed_analysis?.calories ||
          undefined,
      };
      if (photoFoodId && chosen) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: chosen.lookup_id,
          draftFoodId: photoFoodId,
          brand,
          name,
          ingredientsRaw: ingredientsRaw ?? undefined,
          calories: guaranteedAnalysis.calories ?? undefined,
          guaranteedAnalysis,
          activate: false,
        });
      } else if (photoFoodId) {
        food = await verifyFood({
          foodId: photoFoodId,
          brand: brand.trim(),
          name: name.trim(),
          ingredientsRaw: ingredientsRaw ?? '',
          protein: guaranteedAnalysis.crude_protein_min?.toString() ?? '',
          fat: guaranteedAnalysis.crude_fat_min?.toString() ?? '',
          fiber: guaranteedAnalysis.crude_fiber_max?.toString() ?? '',
          moisture: guaranteedAnalysis.moisture_max?.toString() ?? '',
          calories: guaranteedAnalysis.calories ?? '',
          feedingDirections: draft?.feeding_directions ?? '',
        });
      } else if (chosen) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: chosen.lookup_id,
          brand,
          name,
          ingredientsRaw: ingredientsRaw ?? undefined,
          calories: guaranteedAnalysis.calories ?? undefined,
          guaranteedAnalysis,
          activate: false,
        });
      } else {
        food = await createManualFood({
          dogId: dog.id,
          brand,
          name,
          ingredientsRaw: ingredientsRaw ?? undefined,
          protein: protein,
          fat,
          fiber,
          moisture,
          calories: caloriesLabel,
        });
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
  const photoPreviewUri =
    photoLocalUri ||
    photoFoodQuery.data?.label_image_url ||
    photoFoodQuery.data?.catalog_image_url ||
    null;
  const identifyBusy = searching || catalogLoading;
  const identifyEmpty = !identifyBusy && hits.length === 0;

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />

      {step === 'identify' ? (
        <>
          <Text style={styles.hero}>Il cibo di {dog.name}</Text>
          <Text style={styles.lead}>
            Cerca per marca o nome, oppure scegli dallo scaffale. Un tap e confermi.
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

          <Text style={styles.count} accessibilityLiveRegion="polite">
            {searching
              ? query.trim()
                ? `Cerco “${query.trim()}”…`
                : 'Cerco nel catalogo…'
              : catalogLoading
                ? 'Carico lo scaffale…'
                : query.trim()
                  ? hits.length === 0
                    ? `Nessun risultato per “${query.trim()}”`
                    : `${hits.length} risultat${hits.length === 1 ? 'o' : 'i'}`
                  : hits.length === 0
                    ? 'Catalogo vuoto al momento'
                    : 'Tra i più usati'}
          </Text>

          {identifyBusy ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateBody}>
                {searching
                  ? 'Sto cercando nel catalogo Open Pet Food Facts…'
                  : 'Sto caricando i prodotti più usati…'}
              </Text>
            </View>
          ) : null}

          {identifyEmpty ? (
            <View style={styles.stateBlock}>
              <View style={styles.stateIcon}>
                <Ionicons
                  name={query.trim() ? 'search-outline' : 'file-tray-outline'}
                  size={28}
                  color={colors.textMuted}
                />
              </View>
              <Text style={styles.stateTitle}>
                {query.trim()
                  ? 'Non c’è in catalogo'
                  : 'Niente da mostrare qui'}
              </Text>
              <Text style={styles.stateBody}>
                {query.trim()
                  ? 'Prova la marca completa, togli filtri, oppure fotografa il fronte della confezione.'
                  : 'Puoi cercare per nome, oppure aggiungere il cibo con una foto del fronte.'}
              </Text>
            </View>
          ) : null}

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

          {!query.trim() && catalogNextPage && !identifyBusy ? (
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
                <Text style={styles.photoTitle}>Foto del fronte confezione</Text>
                <Text style={styles.photoSub}>
                  Solo marca e nome, ben leggibili
                </Text>
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
            {photoFoodId ? 'Dalla tua foto' : manual ? 'Inserimento' : 'Conferma'}
          </Text>
          <Text style={styles.hero}>
            {photoFoodId
              ? brand.trim() && name.trim()
                ? 'Conferma questo cibo'
                : 'Completa dalla foto'
              : manual
                ? 'Inserisci l’alimento'
                : 'È questo?'}
          </Text>
          {photoFoodId ? (
            <Text style={styles.lead}>
              Sotto vedi l’anteprima. Correggi solo se marca o nome non tornano.
            </Text>
          ) : null}

          {photoFoodId && photoPreviewUri ? (
            <View style={styles.heroPack}>
              <Image
                source={{ uri: photoPreviewUri }}
                style={styles.heroImage}
                accessibilityLabel="Anteprima della foto della confezione"
              />
              <View style={styles.heroInfo}>
                <Text style={styles.heroPeek}>La tua foto · puoi correggere i campi sotto</Text>
              </View>
            </View>
          ) : null}

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
              <Text style={styles.fieldLabel}>
                Marca
                {photoFoodId && brand.trim() ? (
                  <Text style={styles.optional}> · letto dalla foto</Text>
                ) : null}
              </Text>
              <TextInput
                accessibilityLabel="Marca"
                value={brand}
                onChangeText={setBrand}
                placeholder={
                  photoFoodId
                    ? 'Come sulla foto / confezione'
                    : 'Per esempio: Monge'
                }
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>
                Nome completo
                {photoFoodId && name.trim() ? (
                  <Text style={styles.optional}> · letto dalla foto</Text>
                ) : null}
              </Text>
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

          {photoFoodId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setManual(false);
                setSelected(null);
                setStep('identify');
                if (brand.trim() || name.trim()) {
                  setQuery([brand, name].filter(Boolean).join(' '));
                }
              }}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>
                Meglio scegliere dal catalogo
              </Text>
            </Pressable>
          ) : !manual ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('identify')}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>Scegli un altro alimento</Text>
            </Pressable>
          ) : null}

          {!mealReady() ? (
            <View style={styles.enrichCard}>
              <Text style={styles.enrichTitle}>
                Meglio aggiungere l’etichetta
              </Text>
              <Text style={styles.enrichBody}>
                Ingredienti e valori aiutano a capire se il pasto è adatto a{' '}
                {dog.name}. Puoi farlo ora o più tardi.
              </Text>
              <Button
                title="Fotografa ingredienti e valori"
                icon={
                  <Ionicons name="camera" size={18} color={colors.textOnPrimary} />
                }
                onPress={goEnrichPhoto}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setManualNutritionOpen(true)}
                style={styles.textAction}
              >
                <Text style={styles.textActionLabel}>Inseriscili a mano</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.readyRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.readyText}>
                Ingredienti e valori pronti
              </Text>
            </View>
          )}

          {manualNutritionOpen || manual ? (
            <View style={styles.manualFields}>
              <Text style={styles.fieldLabel}>
                Composizione / ingredienti{' '}
                <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Ingredienti"
                value={ingredients}
                onChangeText={setIngredients}
                placeholder="Come scritto in etichetta"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, styles.inputMultiline]}
              />
              <Text style={styles.fieldLabel}>
                Proteine grezze % <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Proteine grezze"
                value={protein}
                onChangeText={setProtein}
                placeholder="Es. 26"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>
                Grassi grezzi % <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Grassi grezzi"
                value={fat}
                onChangeText={setFat}
                placeholder="Es. 14"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>
                Fibre % <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Fibre"
                value={fiber}
                onChangeText={setFiber}
                placeholder="Es. 2,5"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>
                Umidità % <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Umidità"
                value={moisture}
                onChangeText={setMoisture}
                placeholder="Es. 8"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>
                Calorie <Text style={styles.optional}>Facoltativo</Text>
              </Text>
              <TextInput
                accessibilityLabel="Calorie"
                value={caloriesLabel}
                onChangeText={setCaloriesLabel}
                placeholder="Come stampato, es. 350 kcal/100g"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
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
                  {moreOpen
                    ? 'Nascondi altri dettagli'
                    : 'Aggiungi snack o cambio recente'}
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
            title={
              photoFoodId
                ? `Salva foto per ${dog.name}`
                : manual
                  ? `Salva per ${dog.name}`
                  : `Sì, è questo · Salva`
            }
            loading={working}
            disabled={!name.trim() || (Boolean(photoFoodId) && !brand.trim())}
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
  stateBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    marginBottom: 4,
  },
  stateTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  stateBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
    textAlign: 'center',
    maxWidth: 300,
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
  enrichCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  enrichTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  enrichBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
    marginBottom: spacing.xs,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.xs,
  },
  readyText: {
    color: colors.success,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
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
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
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

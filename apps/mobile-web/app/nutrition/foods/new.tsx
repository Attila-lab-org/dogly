import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, ScreenContainer } from '@/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  activateFeedingPeriod,
  confirmExternalFood,
  createManualFood,
  getFood,
  lookupFoodByBarcode,
  searchFoodsByName,
  verifyFood,
  type ExternalFoodCandidate,
} from '@/features/nutrition/api';
import { StackScreenHeader } from '@/features/secondary/components';
import { queryKeys } from '@/lib/queryClient';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Step = 'identify' | 'results' | 'details';

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export default function NewFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    photoFoodId?: string | string[];
    photoQuery?: string | string[];
    scannedBarcode?: string | string[];
  }>();
  const photoFoodId = firstParam(params.photoFoodId);
  const photoQuery = firstParam(params.photoQuery);
  const scannedBarcode = firstParam(params.scannedBarcode);
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const photoStarted = useRef(false);
  const barcodeStarted = useRef(false);

  const [step, setStep] = useState<Step>('identify');
  const [query, setQuery] = useState(photoQuery);
  const [hits, setHits] = useState<ExternalFoodCandidate[]>([]);
  const [selected, setSelected] = useState<ExternalFoodCandidate | null>(null);
  const [exactBarcode, setExactBarcode] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
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

  const photoFoodQuery = useQuery({
    queryKey: ['nutrition-photo-food', photoFoodId],
    queryFn: () => getFood(photoFoodId),
    enabled: Boolean(photoFoodId),
  });

  const search = async (raw: string) => {
    const cleaned = raw.trim();
    if (cleaned.length < 2 || !dog.id || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await searchFoodsByName({ dogId: dog.id, query: cleaned });
      setHits(result.items);
      setSelected(null);
      setExactBarcode(null);
      setStep(result.items.length ? 'results' : 'identify');
      if (!result.items.length) {
        setMessage('Non l’ho trovato. Prova con marca e gusto, oppure inseriscilo tu.');
      }
    } catch {
      setMessage('Non riesco a cercare adesso. Puoi riprovare o inserirlo tu.');
    } finally {
      setWorking(false);
    }
  };

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
      void search(extractedQuery);
    } else {
      setManual(true);
      setStep('details');
      setMessage('Non ho letto abbastanza bene marca e nome. Completa solo questi due campi.');
    }
  }, [photoFoodId, photoFoodQuery.data, photoFoodQuery.isLoading, photoQuery]);

  const findBarcode = async (raw = barcode) => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length < 8 || !dog.id || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const exact = await lookupFoodByBarcode({ dogId: dog.id, barcode: cleaned });
      const relatedQuery = [exact.brand, exact.name].filter(Boolean).join(' ');
      const related =
        relatedQuery.length >= 2
          ? await searchFoodsByName({ dogId: dog.id, query: relatedQuery })
          : { items: [] };
      const catalogExact = related.items.find(
        (item) => item.barcode === exact.barcode,
      );
      const resolvedExact = catalogExact
        ? {
            ...catalogExact,
            ...exact,
            brand: exact.brand ?? catalogExact.brand,
            name: exact.name ?? catalogExact.name,
            variant: exact.variant ?? catalogExact.variant,
            package_size: exact.package_size ?? catalogExact.package_size,
            food_form: exact.food_form ?? catalogExact.food_form,
            image_url: exact.image_url ?? catalogExact.image_url,
          }
        : exact;
      const merged = [resolvedExact, ...related.items].filter(
        (item, index, all) =>
          all.findIndex((other) => other.barcode === item.barcode) === index,
      );
      setHits(merged);
      setExactBarcode(exact.barcode);
      setSelected(null);
      setStep('results');
    } catch {
      setMessage('Codice non riconosciuto. Prova con marca e nome.');
      setStep('identify');
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!scannedBarcode || barcodeStarted.current || photoFoodId) return;
    barcodeStarted.current = true;
    setBarcode(scannedBarcode);
    void findBarcode(scannedBarcode);
  }, [photoFoodId, scannedBarcode]);

  const choose = (item: ExternalFoodCandidate) => {
    setSelected(item);
    setManual(false);
    setBrand(item.brand ?? '');
    setName(item.name ?? '');
    setStep('details');
    setMessage(null);
  };

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
      if (photoFoodId && selected) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: selected.lookup_id,
          draftFoodId: photoFoodId,
          brand,
          name,
          ingredientsRaw: selected.ingredients_raw ?? undefined,
          calories: selected.calories ?? undefined,
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
            selected?.ingredients_raw ?? draft?.ingredients_raw ?? '',
          protein: analysis?.crude_protein_min?.toString() ?? '',
          fat: analysis?.crude_fat_min?.toString() ?? '',
          fiber: analysis?.crude_fiber_max?.toString() ?? '',
          moisture: analysis?.moisture_max?.toString() ?? '',
          calories: selected?.calories ?? analysis?.calories ?? '',
          feedingDirections: draft?.feeding_directions ?? '',
        });
      } else if (selected) {
        food = await confirmExternalFood({
          dogId: dog.id,
          lookupId: selected.lookup_id,
          brand,
          name,
          ingredientsRaw: selected.ingredients_raw ?? undefined,
          calories: selected.calories ?? undefined,
          activate: false,
        });
      } else {
        food = await createManualFood({ dogId: dog.id, brand, name });
      }
      if (activeNow) {
        await activateFeedingPeriod({
          dogId: dog.id,
          foodId: food.id,
          quantityPerDay: quantity,
          treatsNotes: treats,
          transitionNotes: transition,
        });
      }
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

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />

      {step === 'identify' ? (
        <>
          <Text style={styles.title}>Quale alimento mangia?</Text>
          <Text style={styles.subtitle}>
            Cerca per nome oppure fotografa la confezione. Prima di salvare
            sceglierai sempre tu il prodotto giusto.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="Marca o nome dell’alimento"
              value={query}
              onChangeText={setQuery}
              placeholder="Marca o nome"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => void search(query)}
              style={[styles.input, styles.searchInput]}
            />
            <Button
              title="Vai"
              disabled={query.trim().length < 2 || working}
              onPress={() => void search(query)}
            />
          </View>

          <Text style={styles.or}>oppure</Text>
          <MethodButton
            icon="camera-outline"
            title="Usa una foto"
            subtitle="Fotografa marca e nome"
            onPress={() => router.push('/nutrition/foods/scan')}
          />
          <MethodButton
            icon="barcode-outline"
            title="Scansiona il codice"
            subtitle="Inquadra il codice a barre"
            onPress={() => router.push('/nutrition/foods/barcode' as never)}
          />
          <Pressable
            accessibilityRole="button"
            onPress={startManual}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>Non lo trovo, lo inserisco io</Text>
          </Pressable>
        </>
      ) : null}

      {step === 'results' ? (
        <>
          <Text style={styles.title}>Scegli quello giusto</Text>
          <Text style={styles.subtitle}>
            Controlla foto, marca, nome e formato sulla tua confezione.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStep('identify');
              setHits([]);
            }}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>Cambia ricerca</Text>
          </Pressable>
          <View style={styles.results}>
            {hits.map((item) => (
              <CandidateCard
                key={item.lookup_id}
                item={item}
                exact={item.barcode === exactBarcode}
                onPress={() => choose(item)}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={startManual}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>
              Nessuno di questi, lo inserisco io
            </Text>
          </Pressable>
        </>
      ) : null}

      {step === 'details' ? (
        <>
          <Text style={styles.title}>
            {manual ? 'Inserisci l’alimento' : 'Hai scelto questo'}
          </Text>
          {selected ? (
            <CandidateCard item={selected} exact={selected.barcode === exactBarcode} />
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
              onPress={() => setStep(hits.length ? 'results' : 'identify')}
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
                Quanto ne mangia al giorno? <Text style={styles.optional}>Facoltativo</Text>
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
            title={`Salva per ${dog.name}`}
            loading={working}
            disabled={!name.trim()}
            onPress={() => void save()}
          />
        </>
      ) : null}

      {working ? <Text style={styles.status}>Sto cercando…</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScreenContainer>
  );
}

function MethodButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.method}>
      <View style={styles.methodIcon}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.methodCopy}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.methodSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function CandidateCard({
  item,
  exact = false,
  onPress,
}: {
  item: ExternalFoodCandidate;
  exact?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.productImage} />
      ) : (
        <View style={styles.productImageFallback}>
          <Ionicons name="nutrition-outline" size={24} color={colors.accent} />
        </View>
      )}
      <View style={styles.productCopy}>
        {exact ? <Text style={styles.exact}>Corrisponde al codice</Text> : null}
        {item.brand ? <Text style={styles.productBrand}>{item.brand}</Text> : null}
        <Text style={styles.productName}>{item.name}</Text>
        {item.variant ? <Text style={styles.productMeta}>{item.variant}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={20} color={colors.iconMuted} />
      ) : (
        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
      )}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.product}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.product, styles.productSelected]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.sm,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, minWidth: 0 },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
  or: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  methodIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
  },
  methodCopy: { flex: 1 },
  methodTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  methodSubtitle: {
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
  results: { gap: spacing.sm },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  productSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  productImage: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  productImageFallback: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  productCopy: { flex: 1 },
  exact: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    marginBottom: 2,
  },
  productBrand: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  productName: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginTop: 2,
  },
  productMeta: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginTop: 3,
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
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});

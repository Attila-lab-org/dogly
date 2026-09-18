/**
 * Verifica editabile dei campi OCR (Spec V1 sez. 20.1 — OBBLIGATORIA):
 * solo i campi verificati dall'owner diventano dati durevoli
 * (PATCH /v1/nutrition/foods/{id}/verify). "Conferma e attiva" crea un
 * FeedingPeriod (POST /v1/nutrition/feeding-periods), chiudendo quello
 * precedente senza riscrivere la storia.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  activateFeedingPeriod,
  getFood,
  listFeedingPeriods,
  updateFeedingPeriod,
  verifyFood,
} from '@/features/nutrition/api';
import {
  feedingQuantitySuccessCopy,
  isOpenPeriodForFood,
} from '@/features/nutrition/period';

function EditableField({
  label,
  value,
  onChangeText,
  needsReview,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  needsReview?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {needsReview ? <Text style={styles.reviewBadge}>Da controllare</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.inputMultiline]}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function FoodVerifyScreen() {
  const { foodId, reading, focus } = useLocalSearchParams<{
    foodId: string;
    reading?: string;
    focus?: string;
  }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const quantityFocus = focus === 'quantity';

  const foodQuery = useQuery({
    queryKey: ['nutrition-food', foodId],
    queryFn: () => getFood(foodId!),
    enabled: Boolean(foodId),
  });
  const periodsQuery = useQuery({
    queryKey: ['nutrition-feeding-periods', dog.id],
    queryFn: () => listFeedingPeriods(dog.id),
  });

  const food = foodQuery.data;

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [moisture, setMoisture] = useState('');
  const [calories, setCalories] = useState('');
  const [feedingDirections, setFeedingDirections] = useState('');
  const [quantityPerDay, setQuantityPerDay] = useState('');
  const [savedMode, setSavedMode] = useState<'quantity' | 'activated' | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!food) return;
    setName(food.name ?? '');
    setBrand(food.brand ?? '');
    setIngredients(food.ingredients_raw ?? '');
    setProtein(food.guaranteed_analysis?.crude_protein_min?.toString() ?? '');
    setFat(food.guaranteed_analysis?.crude_fat_min?.toString() ?? '');
    setFiber(food.guaranteed_analysis?.crude_fiber_max?.toString() ?? '');
    setMoisture(food.guaranteed_analysis?.moisture_max?.toString() ?? '');
    setCalories(food.guaranteed_analysis?.calories ?? '');
    setFeedingDirections(food.feeding_directions ?? '');
  }, [food]);

  useEffect(() => {
    const open = periodsQuery.data?.find(
      (period) => period.food_product_id === foodId && period.end_at == null,
    );
    if (open?.quantity_per_day) {
      setQuantityPerDay(open.quantity_per_day);
    }
  }, [foodId, periodsQuery.data]);

  if (foodQuery.isLoading) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Controlla etichetta" />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (foodQuery.isError) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Verifica etichetta" />
        <ErrorState
          title="Prodotto non trovato"
          message="Non riesco a caricare questa etichetta. Torna alla lista e riprova."
          onRetry={() => void foodQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!food) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Verifica etichetta" />
        <Card>
          <Text style={styles.note}>
            Questo prodotto non è disponibile: torna alla lista e riprova la
            scansione.
          </Text>
        </Card>
      </ScreenContainer>
    );
  }

  const needsReview = (key: string): boolean => {
    const score = food.extraction_confidence?.[key];
    return typeof score === 'number' && score < 0.72;
  };

  const openPeriod = periodsQuery.data?.find((period) =>
    isOpenPeriodForFood(period, foodId ?? ''),
  );
  const quantityOnly = quantityFocus && Boolean(food.verified_at);
  const foodLabel = [brand.trim(), name.trim()].filter(Boolean).join(' ');

  const confirm = async () => {
    if (quantityOnly) {
      if (!quantityPerDay.trim()) {
        setSaveError('Indica la quantità giornaliera.');
        return;
      }
    } else {
      if (!name.trim()) {
        setSaveError('Serve almeno il nome del prodotto.');
        return;
      }
      if (!food.verified_at && !brand.trim()) {
        setSaveError('Servono almeno marca e nome del prodotto.');
        return;
      }
    }
    const invalidPercentage = [protein, fat, fiber, moisture].some((value) => {
      if (!value.trim()) return false;
      const parsed = Number(value.replace(',', '.'));
      return !Number.isFinite(parsed) || parsed < 0 || parsed > 100;
    });
    if (!quantityOnly && invalidPercentage) {
      setSaveError('Controlla le percentuali: devono essere comprese tra 0 e 100.');
      return;
    }
    if (!foodId) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (quantityOnly && openPeriod) {
        await updateFeedingPeriod({
          periodId: openPeriod.id,
          quantityPerDay: quantityPerDay.trim(),
        });
        setSavedMode('quantity');
        return;
      }
      if (!quantityOnly) {
        await verifyFood({
          foodId,
          brand: brand.trim(),
          name: name.trim(),
          ingredientsRaw: ingredients.trim(),
          protein,
          fat,
          fiber,
          moisture,
          calories,
          feedingDirections,
        });
      }
      await activateFeedingPeriod({
        dogId: dog.id,
        foodId,
        quantityPerDay: quantityPerDay.trim() || undefined,
      });
      setSavedMode('activated');
    } catch {
      setSaveError(
        'Non sono riuscito a salvare il cibo. Controlla i campi e riprova.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (savedMode) {
    const success =
      savedMode === 'quantity'
        ? feedingQuantitySuccessCopy(dog.name, foodLabel || name || 'questo alimento')
        : {
            title: 'Cibo attivato',
            body: `"${foodLabel}" è ora il cibo attivo di ${dog.name}. Il periodo del cibo precedente è stato chiuso: le prossime osservazioni digestive saranno collegate a questo alimento.`,
          };
    return (
      <ScreenContainer>
        <StackScreenHeader title="Verifica etichetta" />
        <Card>
          <View style={styles.doneHeader}>
            <Ionicons name="checkmark-circle" size={40} color={colors.accent} />
            <Text style={styles.doneTitle}>{success.title}</Text>
          </View>
          <Text style={styles.note}>{success.body}</Text>
          <Button
            title={`Vai ai cibi di ${dog.name}`}
            style={styles.doneButton}
            onPress={() => router.replace('/nutrition/foods')}
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Verifica etichetta" />
      {food.label_image_url ? (
        <Image
          source={{ uri: food.label_image_url }}
          resizeMode="contain"
          style={styles.labelImage}
          accessibilityLabel="Foto dell’etichetta acquisita"
        />
      ) : null}
      <Text style={styles.intro}>
        {quantityFocus
          ? `Quanto ne mangia ${dog.name} al giorno? Aggiungi la quantità sul periodo di alimentazione attivo: così le prossime osservazioni digestive avranno questo dato.`
          : reading === 'manual'
            ? 'La foto è salva, ma non sono riuscito a leggere bene i dati. Puoi completarli guardando l’etichetta qui sopra.'
            : 'Ho compilato ciò che era leggibile. Controlla soprattutto i campi segnati.'}{' '}
        Solo ciò che confermi verrà usato per seguire la digestione di {dog.name}{' '}
        nel tempo.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Prodotto</Text>
        <EditableField label="Nome prodotto" value={name} onChangeText={setName} needsReview={!name.trim() || needsReview('name')} />
        <EditableField label="Marca" value={brand} onChangeText={setBrand} needsReview={!brand.trim() || needsReview('brand')} />
        <EditableField
          label="Ingredienti (testo dell'etichetta)"
          value={ingredients}
          onChangeText={setIngredients}
          needsReview={needsReview('ingredients')}
          multiline
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Analisi garantita</Text>
        <EditableField
          label="Proteine grezze min (%)"
          value={protein}
          onChangeText={setProtein}
          needsReview={needsReview('protein')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Grassi grezzi min (%)"
          value={fat}
          onChangeText={setFat}
          needsReview={needsReview('fat')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Fibra grezza max (%)"
          value={fiber}
          onChangeText={setFiber}
          needsReview={needsReview('fiber')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Umidità max (%)"
          value={moisture}
          onChangeText={setMoisture}
          needsReview={needsReview('moisture')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Calorie (come stampato)"
          value={calories}
          onChangeText={setCalories}
          needsReview={needsReview('calories')}
        />
        <EditableField
          label="Indicazioni sulle quantità"
          value={feedingDirections}
          onChangeText={setFeedingDirections}
          needsReview={needsReview('feeding_directions')}
          multiline
        />
        <EditableField
          label="Quantità giornaliera"
          value={quantityPerDay}
          onChangeText={setQuantityPerDay}
          needsReview={quantityFocus && !quantityPerDay.trim()}
        />
      </Card>

      <Text style={styles.note}>
        Le percentuali sono i valori minimi/massimi dichiarati in etichetta,
        non misure esatte del contenuto. Non le useremo mai da sole per trarre
        conclusioni nutrizionali.
      </Text>
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <Button
        title={quantityOnly ? 'Salva quantità' : 'Conferma e attiva'}
        icon={<Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />}
        onPress={() => void confirm()}
        loading={saving}
        style={styles.confirm}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  labelImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.md,
  },
  intro: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  reviewBadge: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  note: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  error: {
    fontSize: typography.size.xs,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  confirm: {
    marginBottom: spacing.xl,
  },
  doneHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  doneTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  doneButton: {
    marginTop: spacing.lg,
  },
});

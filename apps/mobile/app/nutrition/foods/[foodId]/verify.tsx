/**
 * Verifica editabile dei campi OCR (Spec V1 sez. 20.1 — OBBLIGATORIA):
 * solo i campi verificati dall'owner diventano dati durevoli
 * (PATCH /v1/nutrition/foods/{id}/verify). "Conferma e attiva" crea un
 * FeedingPeriod (POST /v1/nutrition/feeding-periods), chiudendo quello
 * precedente senza riscrivere la storia.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { foodProductsMock } from '@/mocks/secondary';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  ConfidenceBandPill,
  StackScreenHeader,
} from '@/features/secondary/components';
import type { ConfidenceBand } from '@/contracts/types';
import {
  activateFeedingPeriod,
  getFood,
  verifyFood,
} from '@/features/nutrition/api';

function EditableField({
  label,
  value,
  onChangeText,
  band,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  band?: ConfidenceBand;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {band ? <ConfidenceBandPill band={band} /> : null}
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
  const { foodId } = useLocalSearchParams<{ foodId: string }>();
  const router = useRouter();
  const { usingMockGate } = useSession();
  const { dog } = useDogProfile();
  const mockFood = foodProductsMock.find((f) => f.id === foodId);
  const realEnabled = !usingMockGate && Boolean(foodId);

  const foodQuery = useQuery({
    queryKey: ['nutrition-food', foodId],
    queryFn: () => getFood(foodId!),
    enabled: realEnabled,
  });

  const food = realEnabled ? foodQuery.data : mockFood
    ? {
        id: mockFood.id,
        brand: mockFood.brand,
        name: mockFood.name,
        ingredients_raw: mockFood.ingredientsRaw,
        guaranteed_analysis: {
          crude_protein_min: mockFood.guaranteedAnalysis.crudeProteinMin,
          crude_fat_min: mockFood.guaranteedAnalysis.crudeFatMin,
          crude_fiber_max: mockFood.guaranteedAnalysis.crudeFiberMax,
          moisture_max: mockFood.guaranteedAnalysis.moistureMax,
          calories: mockFood.calories,
        },
        verified_at: mockFood.verifiedAt,
      }
    : undefined;

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [moisture, setMoisture] = useState('');
  const [calories, setCalories] = useState('');
  const [confirmed, setConfirmed] = useState(false);
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
  }, [food]);

  if (realEnabled && foodQuery.isError) {
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

  if (!food && !realEnabled) {
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

  const band = (key: string): ConfidenceBand | undefined =>
    mockFood?.fieldConfidence[key];

  const confirm = async () => {
    if (!brand.trim() || !name.trim()) {
      setSaveError('Servono almeno marca e nome del prodotto.');
      return;
    }
    if (usingMockGate) {
      setConfirmed(true);
      return;
    }
    if (!foodId) return;
    setSaving(true);
    setSaveError(null);
    try {
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
      });
      await activateFeedingPeriod({ dogId: dog.id, foodId });
      setConfirmed(true);
    } catch {
      setSaveError(
        'Non sono riuscito a salvare il cibo. Controlla i campi e riprova.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (confirmed) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Verifica etichetta" />
        <Card>
          <View style={styles.doneHeader}>
            <Ionicons name="checkmark-circle" size={40} color={colors.accent} />
            <Text style={styles.doneTitle}>Cibo attivato</Text>
          </View>
          <Text style={styles.note}>
            "{brand} {name}" è ora il cibo attivo di {dog.name}. Il periodo del cibo
            precedente è stato chiuso: le prossime osservazioni digestive
            saranno collegate a questo alimento.
          </Text>
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
      <Text style={styles.intro}>
        {usingMockGate
          ? "Controlla e correggi i campi letti dall'etichetta."
          : "Usa la foto come riferimento e inserisci i valori riportati sull'etichetta."}{' '}
        Solo ciò che confermi diventa definitivo: i valori servono a
        confrontare la digestione di {dog.name} nel tempo.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Prodotto</Text>
        <EditableField label="Nome prodotto" value={name} onChangeText={setName} band={band('name')} />
        <EditableField label="Marca" value={brand} onChangeText={setBrand} band={band('brand')} />
        <EditableField
          label="Ingredienti (testo dell'etichetta)"
          value={ingredients}
          onChangeText={setIngredients}
          band={band('ingredients')}
          multiline
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Analisi garantita</Text>
        <EditableField
          label="Proteine grezze min (%)"
          value={protein}
          onChangeText={setProtein}
          band={band('protein')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Grassi grezzi min (%)"
          value={fat}
          onChangeText={setFat}
          band={band('fat')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Fibra grezza max (%)"
          value={fiber}
          onChangeText={setFiber}
          band={band('fiber')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Umidità max (%)"
          value={moisture}
          onChangeText={setMoisture}
          band={band('moisture')}
          keyboardType="decimal-pad"
        />
        <EditableField
          label="Calorie (come stampato)"
          value={calories}
          onChangeText={setCalories}
          band={band('calories')}
        />
      </Card>

      <Text style={styles.note}>
        Le percentuali sono i valori minimi/massimi dichiarati in etichetta,
        non misure esatte del contenuto. Non le useremo mai da sole per trarre
        conclusioni nutrizionali.
      </Text>
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <Button
        title="Conferma e attiva"
        icon={<Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />}
        onPress={() => void confirm()}
        loading={saving}
        style={styles.confirm}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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

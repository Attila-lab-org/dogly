/**
 * Verifica editabile dei campi OCR (Spec V1 sez. 20.1 — OBBLIGATORIA):
 * solo i campi verificati dall'owner diventano dati durevoli
 * (PATCH /v1/nutrition/foods/{id}/verify). "Conferma e attiva" crea un
 * FeedingPeriod (POST /v1/nutrition/feeding-periods), chiudendo quello
 * precedente senza riscrivere la storia.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { foodProductsMock } from '@/mocks/secondary';
import {
  ConfidenceBandPill,
  StackScreenHeader,
} from '@/features/secondary/components';
import type { ConfidenceBand } from '@/contracts/types';

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
  band: ConfidenceBand;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <ConfidenceBandPill band={band} />
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
  const food = foodProductsMock.find((f) => f.id === foodId);

  const [name, setName] = useState(food?.name ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [ingredients, setIngredients] = useState(food?.ingredientsRaw ?? '');
  const [protein, setProtein] = useState(
    food?.guaranteedAnalysis.crudeProteinMin?.toString() ?? '',
  );
  const [fat, setFat] = useState(
    food?.guaranteedAnalysis.crudeFatMin?.toString() ?? '',
  );
  const [fiber, setFiber] = useState(
    food?.guaranteedAnalysis.crudeFiberMax?.toString() ?? '',
  );
  const [moisture, setMoisture] = useState(
    food?.guaranteedAnalysis.moistureMax?.toString() ?? '',
  );
  const [calories, setCalories] = useState(food?.calories ?? '');
  const [confirmed, setConfirmed] = useState(false);

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

  const band = (key: string): ConfidenceBand =>
    food.fieldConfidence[key] ?? 'MEDIUM';

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
            "{brand} {name}" è ora il cibo attivo di Rocky. Il periodo del cibo
            precedente è stato chiuso: le prossime osservazioni digestive
            saranno collegate a questo alimento.
          </Text>
          <Button
            title="Vai ai cibi di Rocky"
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
        Controlla e correggi i campi letti dall'etichetta. Solo ciò che
        confermi diventa definitivo: i valori servono a confrontare la
        digestione di Rocky nel tempo.
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

      <Button
        title="Conferma e attiva"
        icon={<Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />}
        onPress={() => setConfirmed(true)}
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
    marginBottom: spacing.sm,
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

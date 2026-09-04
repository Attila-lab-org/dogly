/**
 * Food label scan (Spec V1 sez. 6 — "Food label scan": OCR confidence,
 * editable verification, duplicate active product).
 * Il flusso OCR è mockato (ML Kit on-device quando lo spike passa, sez. 20.1);
 * i campi a bassa confidence richiedono verifica nella schermata successiva.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { foodProductsMock } from '@/mocks/secondary';
import {
  ConfidenceBandPill,
  StackScreenHeader,
} from '@/features/secondary/components';
import type { ConfidenceBand } from '@/contracts/types';

type Phase = 'ready' | 'scanning' | 'done';

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome prodotto',
  brand: 'Marca',
  ingredients: 'Ingredienti',
  protein: 'Proteine grezze (min)',
  fat: 'Grassi grezzi (min)',
  fiber: 'Fibra grezza (max)',
  moisture: 'Umidità (max)',
  calories: 'Calorie',
};

export default function FoodScanScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('ready');
  const draft = foodProductsMock.find((f) => f.verifiedAt === null);

  useEffect(() => {
    if (phase !== 'scanning') return undefined;
    const timer = setTimeout(() => setPhase('done'), 1800);
    return () => clearTimeout(timer);
  }, [phase]);

  const activeProduct = foodProductsMock.find((f) => f.verifiedAt !== null);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Scansiona etichetta" />
      <Text style={styles.intro}>
        Inquadra l'etichetta con gli ingredienti e la tabella nutrizionale.
        Leggerò il testo e poi potrai controllare tutto prima di confermare.
      </Text>

      <Card noPadding style={styles.frameCard}>
        <View style={styles.frameArea}>
          <Ionicons
            name={phase === 'done' ? 'document-text' : 'scan-outline'}
            size={48}
            color={phase === 'done' ? colors.accent : colors.textMuted}
          />
          <Text style={styles.frameLabel}>
            {phase === 'ready' && 'Nessuna etichetta acquisita'}
            {phase === 'scanning' && 'Sto leggendo il testo…'}
            {phase === 'done' && 'Testo letto: controlla i campi'}
          </Text>
        </View>
      </Card>

      {phase === 'done' && draft && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Campi letti dall'etichetta</Text>
          {Object.entries(FIELD_LABELS).map(([key, label]) => {
            const band: ConfidenceBand =
              draft.fieldConfidence[key] ?? 'MEDIUM';
            return (
              <View key={key} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <ConfidenceBandPill band={band} />
              </View>
            );
          })}
          <Text style={styles.note}>
            I campi con confidenza bassa vanno controllati con attenzione: solo
            i campi che confermi diventano dati definitivi.
          </Text>
          {activeProduct && (
            <View style={styles.duplicateBanner}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.duplicateText}>
                Rocky sta già mangiando "{activeProduct.brand}{' '}
                {activeProduct.name}". Confermando, il nuovo cibo diventerà
                quello attivo e il periodo precedente verrà chiuso.
              </Text>
            </View>
          )}
        </Card>
      )}

      <View style={styles.actions}>
        {phase === 'ready' && (
          <Button
            title="Scansiona etichetta"
            icon={<Ionicons name="scan" size={18} color={colors.textOnPrimary} />}
            onPress={() => setPhase('scanning')}
          />
        )}
        {phase === 'scanning' && (
          <Button title="Lettura in corso…" loading onPress={() => {}} />
        )}
        {phase === 'done' && draft && (
          <>
            <Button
              title="Verifica i campi"
              icon={
                <Ionicons name="create-outline" size={18} color={colors.textOnPrimary} />
              }
              onPress={() => router.push(`/nutrition/foods/${draft.id}/verify`)}
            />
            <Button
              title="Scansiona di nuovo"
              variant="outline"
              onPress={() => setPhase('ready')}
            />
          </>
        )}
      </View>
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
  frameCard: {
    marginBottom: spacing.lg,
  },
  frameArea: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    margin: spacing.md,
  },
  frameLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  note: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  duplicateText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  actions: {
    gap: spacing.sm,
  },
});

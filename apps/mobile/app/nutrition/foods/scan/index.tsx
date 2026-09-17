/**
 * Food label scan (Spec V1 sez. 6 — "Food label scan": OCR confidence,
 * editable verification, duplicate active product).
 * L'OCR on-device non è ancora collegato: in produzione si acquisisce la
 * foto, si carica l'etichetta e i campi si compilano nella verifica.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { takeDigestivePhoto } from '@/features/digestive/photo';
import { scanAndUploadFoodLabel } from '@/features/nutrition/api';

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
  const { usingMockGate } = useSession();
  const { dog } = useDogProfile();
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);
  const draft = foodProductsMock.find((f) => f.verifiedAt === null);

  useEffect(() => {
    if (!usingMockGate || phase !== 'scanning') return undefined;
    const timer = setTimeout(() => setPhase('done'), 1800);
    return () => clearTimeout(timer);
  }, [phase, usingMockGate]);

  const activeProduct = foodProductsMock.find((f) => f.verifiedAt !== null);

  const startRealScan = async () => {
    setError(null);
    setPhase('scanning');
    try {
      const uri = await takeDigestivePhoto();
      if (!uri) {
        setPhase('ready');
        return;
      }
      const foodId = await scanAndUploadFoodLabel({
        dogId: dog.id,
        localUri: uri,
      });
      router.replace(`/nutrition/foods/${foodId}/verify`);
    } catch {
      setError(
        'Non sono riuscito a caricare l’etichetta. Controlla la connessione e riprova.',
      );
      setPhase('ready');
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Scansiona etichetta" />
      <Text style={styles.intro}>
        Inquadra l'etichetta con gli ingredienti e la tabella nutrizionale.
        {usingMockGate
          ? ' Leggerò il testo e poi potrai controllare tutto prima di confermare.'
          : ' Poi controllerai e confermerai i campi: solo ciò che verifichi diventa definitivo.'}
      </Text>

      {error ? (
        <ErrorState title="Caricamento non riuscito" message={error} />
      ) : null}

      <Card noPadding style={styles.frameCard}>
        <View style={styles.frameArea}>
          <Ionicons
            name={phase === 'done' ? 'document-text' : 'scan-outline'}
            size={48}
            color={phase === 'done' ? colors.accent : colors.textMuted}
          />
          <Text style={styles.frameLabel}>
            {phase === 'ready' && 'Nessuna etichetta acquisita'}
            {phase === 'scanning' &&
              (usingMockGate ? 'Sto leggendo il testo…' : 'Carico la foto…')}
            {phase === 'done' &&
              (usingMockGate
                ? 'Testo letto: controlla i campi'
                : 'Foto caricata: inserisci i dati dell’etichetta')}
          </Text>
        </View>
      </Card>

      {usingMockGate && phase === 'done' && draft && (
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
                {dog.name} sta già mangiando "{activeProduct.brand}{' '}
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
            onPress={() =>
              usingMockGate ? setPhase('scanning') : void startRealScan()
            }
          />
        )}
        {phase === 'scanning' && (
          <Button title="Lettura in corso…" loading onPress={() => {}} />
        )}
        {usingMockGate && phase === 'done' && draft && (
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

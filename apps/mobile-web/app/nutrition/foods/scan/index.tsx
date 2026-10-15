import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { scanAndUploadFoodLabel } from '@/features/nutrition/api';
import { takeFoodLabelPhoto } from '@/features/nutrition/photo';

type Phase = 'ready' | 'reading' | 'error';

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export default function FoodScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    enrich?: string | string[];
    catalogBarcode?: string | string[];
    lookupId?: string | string[];
    brand?: string | string[];
    name?: string | string[];
  }>();
  const enrich = firstParam(params.enrich) === '1';
  const catalogBarcode = firstParam(params.catalogBarcode);
  const lookupId = firstParam(params.lookupId);
  const brand = firstParam(params.brand);
  const name = firstParam(params.name);
  const { dog } = useDogProfile();
  const [phase, setPhase] = useState<Phase>('ready');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startScan = async () => {
    setError(null);
    setStatus(null);
    try {
      const uri = await takeFoodLabelPhoto();
      if (!uri) return;

      // Feedback immediato: foto acquisita, poi lettura.
      setPreviewUri(uri);
      setPhase('reading');
      setStatus('Foto acquisita. Sto leggendo l’etichetta…');

      const result = await scanAndUploadFoodLabel({
        dogId: dog.id,
        localUri: uri,
      });

      setStatus(
        enrich
          ? 'Fatto. Ti porto a controllare i valori…'
          : 'Fatto. Ti porto a scegliere l’alimento…',
      );

      if (enrich) {
        router.replace({
          pathname: `/nutrition/foods/${result.foodId}/verify` as never,
          params: {
            enrich: '1',
            lookupId,
            catalogBarcode,
            brand: brand || result.food?.brand || '',
            name: name || result.food?.name || '',
          },
        });
        return;
      }
      const query = [result.food?.brand, result.food?.name]
        .filter(Boolean)
        .join(' ');
      router.replace({
        pathname: '/nutrition/foods/new' as never,
        params: {
          photoFoodId: result.foodId,
          photoQuery: query,
        },
      });
    } catch {
      setPhase('error');
      setStatus(null);
      setError(
        enrich
          ? 'Non leggo bene ingredienti e valori. Riprova con più luce, senza riflessi.'
          : 'Non sono riuscito a leggere l’etichetta. Controlla che sia nitida e riprova.',
      );
    }
  };

  const busy = phase === 'reading';

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <StackScreenHeader
        title={enrich ? 'Etichetta' : 'Fotografa'}
      />

      <View style={styles.body}>
        <Text style={styles.hero}>
          {enrich
            ? 'Inquadra ingredienti e valori'
            : 'Inquadra marca e nome'}
        </Text>
        <Text style={styles.lead}>
          {enrich
            ? `Così capisco meglio il pasto di ${dog.name}. Un solo scatto.`
            : `Poi ti mostro i possibili match: scegli tu quello di ${dog.name}.`}
        </Text>

        {previewUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewUri }} style={styles.preview} />
            {busy ? (
              <View style={styles.previewOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
              </View>
            ) : null}
          </View>
        ) : null}

        {status ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        {phase === 'ready' || phase === 'error' ? (
          <Button
            title={phase === 'error' ? 'Riprova' : 'Apri fotocamera'}
            icon={
              <Ionicons
                name="camera"
                size={18}
                color={colors.textOnPrimary}
              />
            }
            onPress={() => void startScan()}
          />
        ) : (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>Un attimo…</Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },
  body: {
    flex: 1,
    gap: spacing.md,
  },
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
  previewWrap: {
    marginTop: spacing.sm,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    aspectRatio: 3 / 4,
    maxHeight: 360,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,42,71,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  error: {
    color: colors.danger,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  busyRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  busyText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});

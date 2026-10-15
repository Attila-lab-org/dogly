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
          photoLocalUri: uri,
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
            ? 'Foto dell’etichetta nutrizionale'
            : 'Foto del fronte della confezione'}
        </Text>
        <Text style={styles.lead}>
          {enrich
            ? `Serve il lato con COMPOSIZIONE e valori (proteine, grassi…). Un solo scatto, nitido e senza riflessi.`
            : `Serve il fronte dove si leggono bene marca e nome del prodotto di ${dog.name}. Non l’etichetta dietro.`}
        </Text>

        {!previewUri ? (
          <View style={styles.guide} accessibilityRole="summary">
            <View style={styles.guideIcon}>
              <Ionicons
                name={enrich ? 'list-outline' : 'cube-outline'}
                size={28}
                color={colors.accent}
              />
            </View>
            <View style={styles.guideCopy}>
              <Text style={styles.guideTitle}>
                {enrich ? 'Cosa inquadrare' : 'Cosa inquadrare'}
              </Text>
              <Text style={styles.guideItem}>
                {enrich
                  ? '1. Gira la confezione sul lato ingredienti'
                  : '1. Tieni la confezione dritta, fronte verso di te'}
              </Text>
              <Text style={styles.guideItem}>
                {enrich
                  ? '2. Inquadra testo ingredienti + % analitiche'
                  : '2. Marca e nome devono stare dentro l’inquadratura'}
              </Text>
              <Text style={styles.guideItem}>
                3. Luce buona, niente flash riflesso
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: previewUri }}
              style={styles.preview}
              accessibilityLabel="Anteprima della foto appena scattata"
            />
            {busy ? (
              <View style={styles.previewOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
              </View>
            ) : null}
          </View>
        )}

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
            title={
              phase === 'error'
                ? 'Riprova foto'
                : enrich
                  ? 'Scatta etichetta'
                  : 'Scatta fronte confezione'
            }
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
            <Text style={styles.busyText}>Leggo la foto…</Text>
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
  guide: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  guideCopy: { flex: 1, gap: 6 },
  guideTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    marginBottom: 2,
  },
  guideItem: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.35,
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
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { scanAndUploadFoodLabel } from '@/features/nutrition/api';
import { takeFoodLabelPhoto } from '@/features/nutrition/photo';

type Phase = 'ready' | 'scanning';

export default function FoodScanScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);

  const startScan = async () => {
    setError(null);
    setPhase('scanning');
    try {
      const uri = await takeFoodLabelPhoto();
      if (!uri) {
        setPhase('ready');
        return;
      }
      const result = await scanAndUploadFoodLabel({
        dogId: dog.id,
        localUri: uri,
      });
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
      setError(
        'Non sono riuscito a leggere l’etichetta. Controlla che la foto sia nitida e riprova.',
      );
      setPhase('ready');
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Fotografa la confezione" />
      <Text style={styles.intro}>
        Inquadra il lato dove si vedono bene marca e nome. Ti mostrerò gli
        alimenti possibili: sarai tu a scegliere quello giusto.
      </Text>

      {error ? (
        <ErrorState title="Etichetta non letta" message={error} />
      ) : null}

      <Card noPadding style={styles.frameCard}>
        <View style={styles.frameArea}>
          <Ionicons
            name="scan-outline"
            size={48}
            color={phase === 'scanning' ? colors.accent : colors.textMuted}
          />
          <Text style={styles.frameLabel}>
            {phase === 'ready'
              ? 'Marca e nome devono essere leggibili'
              : 'Sto cercando gli alimenti possibili…'}
          </Text>
        </View>
      </Card>

      <View style={styles.actions}>
        {phase === 'ready' && (
          <Button
            title="Scatta la foto"
            icon={<Ionicons name="scan" size={18} color={colors.textOnPrimary} />}
            onPress={() => void startScan()}
          />
        )}
        {phase === 'scanning' && (
          <Button title="Lettura in corso…" loading onPress={() => undefined} />
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
  actions: {
    gap: spacing.sm,
  },
});

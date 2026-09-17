/**
 * Food products (Spec V1 sez. 20): lista prodotti + cibo attivo.
 * Solo i campi verificati diventano dati durevoli: i prodotti non verificati
 * mostrano il badge "Da verificare" e portano alla schermata di verifica.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Chip, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import { queryKeys } from '@/lib/queryClient';
import { listFeedingPeriods, listFoods } from '@/features/nutrition/api';

export default function FoodsScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const { dog } = useDogProfile();
  const realEnabled = Boolean(userId);

  const foodsQuery = useQuery({
    queryKey: [...queryKeys.foods(userId ?? 'anon', dog.id)],
    queryFn: () => listFoods(dog.id),
    enabled: realEnabled,
  });
  const periodsQuery = useQuery({
    queryKey: [...queryKeys.foods(userId ?? 'anon', dog.id), 'periods'],
    queryFn: () => listFeedingPeriods(dog.id),
    enabled: realEnabled,
  });

  if (realEnabled && (foodsQuery.isError || periodsQuery.isError)) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Alimentazione" />
        <ErrorState
          title="Non riesco a caricare i cibi"
          message="Controlla la connessione e riprova."
          onRetry={() => {
            void foodsQuery.refetch();
            void periodsQuery.refetch();
          }}
        />
      </ScreenContainer>
    );
  }

  const foods = foodsQuery.data ?? [];
  const periods = periodsQuery.data ?? [];
  const activePeriod = periods.find((period) => period.end_at == null);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />
      <Text style={styles.intro}>
        Qui puoi indicare cosa mangia {dog.name}. Nel tempo confronterò queste
        informazioni con le sue osservazioni digestive.
      </Text>

      {foods.length === 0 && (
        <Text style={styles.intro}>
          Non hai ancora salvato alimenti. Puoi inserirne uno in pochi passaggi
          oppure fotografare l’etichetta.
        </Text>
      )}

      {foods.map((food) => {
        const isActive = activePeriod?.food_product_id === food.id;
        const verified = food.verified_at !== null;
        return (
          <Pressable
            key={food.id}
            accessibilityRole="button"
            onPress={() =>
              verified
                ? undefined
                : router.push(`/nutrition/foods/${food.id}/verify`)
            }
          >
            <Card style={styles.foodCard}>
              <View style={styles.foodHeader}>
                <View style={styles.foodIconWrap}>
                  <Ionicons name="nutrition" size={20} color={colors.accent} />
                </View>
                <View style={styles.foodTextWrap}>
                  <Text style={styles.foodBrand}>{food.brand || 'Marca da inserire'}</Text>
                  <Text style={styles.foodName}>{food.name || 'Prodotto da verificare'}</Text>
                </View>
                {!verified && (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                )}
              </View>
              <View style={styles.chipsRow}>
                {isActive && <Chip label="Cibo attivo" tone="accent" />}
                {verified ? (
                  <Chip label="Verificato" tone="success" />
                ) : (
                  <Chip label="Da controllare" tone="warning" />
                )}
              </View>
              {isActive && activePeriod?.quantity_per_day && (
                <Text style={styles.quantity}>
                  Quantità: {activePeriod.quantity_per_day} · dal{' '}
                  {new Date(activePeriod.start_at).toLocaleDateString('it-IT')}
                </Text>
              )}
              {!verified && (
                <Text style={styles.verifyHint}>
                  Tocca per controllare i dati letti dall’etichetta.
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      <Button
        title="Fotografa un’etichetta"
        icon={<Ionicons name="scan-outline" size={18} color={colors.textOnPrimary} />}
        onPress={() => router.push('/nutrition/foods/scan')}
      />
      <Button
        title="Inserisci senza etichetta"
        variant="outline"
        icon={<Ionicons name="create-outline" size={18} color={colors.accent} />}
        onPress={() => router.push('/nutrition/foods/new' as never)}
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
  foodCard: {
    marginBottom: spacing.md,
  },
  foodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  foodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodTextWrap: {
    flex: 1,
  },
  foodBrand: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  foodName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quantity: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  verifyHint: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.warning,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

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
import { feedingPeriodsMock, foodProductsMock } from '@/mocks/secondary';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import { queryKeys } from '@/lib/queryClient';
import { listFeedingPeriods, listFoods } from '@/features/nutrition/api';

export default function FoodsScreen() {
  const router = useRouter();
  const { usingMockGate, userId } = useSession();
  const { dog } = useDogProfile();
  const realEnabled = !usingMockGate && Boolean(userId);

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
          message="Controlla la connessione e riprova. Nessun dato simulato verrà mostrato."
          onRetry={() => {
            void foodsQuery.refetch();
            void periodsQuery.refetch();
          }}
        />
      </ScreenContainer>
    );
  }

  const foods = realEnabled
    ? (foodsQuery.data ?? [])
    : foodProductsMock.map((food) => ({
        id: food.id,
        brand: food.brand,
        name: food.name,
        verified_at: food.verifiedAt,
      }));
  const periods = realEnabled
    ? (periodsQuery.data ?? [])
    : feedingPeriodsMock.map((period) => ({
        id: period.id,
        dog_id: period.dogId,
        food_product_id: period.foodProductId,
        start_at: period.startedAt,
        end_at: period.endedAt,
        quantity_per_day: period.quantityPerDay,
      }));
  const activePeriod = periods.find((period) => period.end_at == null);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />
      <Text style={styles.intro}>
        Il cibo attivo viene collegato a ogni osservazione digestiva, così
        possiamo notare cambiamenti quando cambi alimentazione.
      </Text>

      {foods.length === 0 && (
        <Text style={styles.intro}>
          Nessun alimento salvato. Scansiona un’etichetta per iniziare: i
          campi vanno confermati da te prima di diventare definitivi.
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
                  <Chip label="Da verificare" tone="warning" />
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
                  Tocca per inserire i valori dell'etichetta prima
                  che diventino definitivi.
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      <Button
        title="Scansiona una nuova etichetta"
        variant="outline"
        icon={<Ionicons name="scan-outline" size={18} color={colors.accent} />}
        onPress={() => router.push('/nutrition/foods/scan')}
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

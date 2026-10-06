/**
 * Food products (Spec V1 sez. 20): lista prodotti + cibo attivo.
 * Solo i campi verificati diventano dati durevoli: i prodotti non verificati
 * mostrano il badge "Da verificare" e portano alla schermata di verifica.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Chip, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';
import { deleteFood, listFeedingPeriods, listFoods } from '@/features/nutrition/api';

export default function FoodsScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const { dog } = useDogProfile();
  const realEnabled = Boolean(userId) && isPersistedId(dog.id);

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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeFood = async (foodId: string) => {
    try {
      await deleteFood(foodId);
      await foodsQuery.refetch();
      setPendingId(null);
    } catch {
      setRemoveError('Non è stato possibile rimuoverlo. Riprova tra poco.');
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />
      <Text style={styles.intro}>
        Qui puoi indicare cosa mangia {dog.name}. Nel tempo confronterò queste
        informazioni con le sue osservazioni digestive.
      </Text>

      <Button
        title="Aggiungi alimento"
        icon={<Ionicons name="add" size={18} color={colors.textOnPrimary} />}
        onPress={() => router.push('/nutrition/foods/new' as never)}
      />

      {foods.length === 0 && (
        <Text style={styles.intro}>
          Non hai ancora salvato alimenti.
        </Text>
      )}

      {foods.filter((food) => activePeriod?.food_product_id === food.id).map((food) => {
        const isActive = activePeriod?.food_product_id === food.id;
        const verified = food.verified_at !== null;
        return (
          <Pressable
            key={food.id}
            accessibilityRole="button"
            onPress={() =>
              router.push(
                verified
                  ? `/nutrition/foods/${food.id}/verify?focus=quantity`
                  : `/nutrition/foods/${food.id}/verify`,
              )
            }
          >
            <Card style={[styles.foodCard, styles.activeCard]}>
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
              <Text style={styles.verifyHint}>{verified ? 'Tocca per modificare alimento o quantità.' : 'Tocca per completare i dati.'}</Text>
              <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); setRemoveError(null); setPendingId(food.id); }} style={styles.removeAction}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={styles.removeLabel}>Rimuovi</Text>
              </Pressable>
            </Card>
          </Pressable>
        );
      })}

      {foods.some((food) => activePeriod?.food_product_id === food.id) ? <Text style={styles.sectionTitle}>Alimenti salvati</Text> : null}
      {foods.filter((food) => activePeriod?.food_product_id !== food.id && food.verified_at !== null).map((food) => (
        <Pressable key={food.id} accessibilityRole="button" onPress={() => router.push(`/nutrition/foods/${food.id}/verify?focus=quantity`)}>
          <Card style={styles.foodCard}>
            <View style={styles.foodHeader}>
              <View style={styles.foodIconWrap}><Ionicons name="nutrition" size={20} color={colors.accent} /></View>
              <View style={styles.foodTextWrap}><Text style={styles.foodBrand}>{food.brand || 'Alimento salvato'}</Text><Text style={styles.foodName}>{food.name || 'Alimento'}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
            <Chip label="Salvato" tone="success" />
            <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); setRemoveError(null); setPendingId(food.id); }} style={styles.removeAction}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={styles.removeLabel}>Rimuovi</Text>
            </Pressable>
          </Card>
        </Pressable>
      ))}

      {foods.some((food) => food.verified_at === null) ? <Text style={styles.sectionTitle}>Da completare</Text> : null}
      {foods.filter((food) => food.verified_at === null).map((food) => (
        <Pressable key={food.id} accessibilityRole="button" onPress={() => router.push(`/nutrition/foods/${food.id}/verify`)}>
          <Card style={[styles.foodCard, styles.pendingCard]}>
            <View style={styles.foodHeader}>
              <View style={styles.foodIconWrap}><Ionicons name="alert-circle-outline" size={20} color={colors.warning} /></View>
              <View style={styles.foodTextWrap}><Text style={styles.foodBrand}>{food.brand || 'Da controllare'}</Text><Text style={styles.foodName}>{food.name || 'Alimento da completare'}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
            <Chip label="Completa dati" tone="warning" />
              <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); setRemoveError(null); setPendingId(food.id); }} style={styles.removeAction}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={styles.removeLabel}>Rimuovi</Text>
              </Pressable>
          </Card>
        </Pressable>
      ))}
      <Modal transparent visible={pendingId !== null} animationType="fade" onRequestClose={() => setPendingId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rimuovere alimento?</Text>
            <Text style={styles.intro}>Scomparirà dall’elenco, mentre lo storico resterà conservato.</Text>
            {removeError ? <Text style={styles.removeLabel}>{removeError}</Text> : null}
            <Button title="Rimuovi alimento" onPress={() => pendingId && void removeFood(pendingId)} />
            <Pressable onPress={() => setPendingId(null)} style={styles.cancelAction}><Text style={styles.foodName}>Annulla</Text></Pressable>
          </View>
        </View>
      </Modal>
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
  activeCard: { borderWidth: 2, borderColor: colors.accent },
  pendingCard: { backgroundColor: colors.warningSoft },
  removeAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, alignSelf: 'flex-start' },
  removeLabel: { color: colors.danger, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(15,35,65,0.48)' },
  modalCard: { width: '100%', maxWidth: 380, padding: spacing.lg, borderRadius: 24, backgroundColor: colors.surface },
  modalTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
  cancelAction: { alignItems: 'center', padding: spacing.md },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.sm, color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.bold },
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

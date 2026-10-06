/**
 * Elenco degli alimenti realmente salvati per il cane.
 * La schermata espone una sola gerarchia: alimento attivo, poi gli altri.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Chip, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';
import { deleteFood, listFeedingPeriods, listFoods, type ApiFoodProduct } from '@/features/nutrition/api';

function FoodRow({ food, active, onOpen, onRemove }: { food: ApiFoodProduct; active: boolean; onOpen: () => void; onRemove: () => void }) {
  const verified = food.verified_at !== null;
  return (
    <Card style={[styles.foodCard, ...(active ? [styles.activeCard] : []), ...(!verified ? [styles.pendingCard] : [])]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.cardPressArea}>
        <View style={styles.foodHeader}>
          <View style={styles.foodIconWrap}>
            <Ionicons name={verified ? 'nutrition' : 'alert-circle-outline'} size={20} color={verified ? colors.accent : colors.warning} />
          </View>
          <View style={styles.foodTextWrap}>
            <Text style={styles.foodBrand}>{food.brand || 'Marca da inserire'}</Text>
            <Text style={styles.foodName}>{food.name || 'Prodotto da verificare'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        <View style={styles.chipsRow}>
          {active ? <Chip label="Cibo attivo" tone="accent" /> : null}
          <Chip label={verified ? 'Verificato' : 'Da completare'} tone={verified ? 'success' : 'warning'} />
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Rimuovi ${food.name || 'questo alimento'}`} onPress={onRemove} style={styles.removeAction}>
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.removeLabel}>Rimuovi</Text>
      </Pressable>
    </Card>
  );
}

export default function FoodsScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const { dog } = useDogProfile();
  const realEnabled = Boolean(userId) && isPersistedId(dog.id);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

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

  const removeFood = async () => {
    if (!pendingId || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await deleteFood(pendingId);
      await foodsQuery.refetch();
      setPendingId(null);
    } catch {
      setRemoveError('Non è stato possibile rimuoverlo. Riprova tra poco.');
    } finally {
      setRemoving(false);
    }
  };

  if (realEnabled && (foodsQuery.isError || periodsQuery.isError)) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Alimentazione" />
        <ErrorState title="Non riesco a caricare i cibi" message="Controlla la connessione e riprova." onRetry={() => { void foodsQuery.refetch(); void periodsQuery.refetch(); }} />
      </ScreenContainer>
    );
  }

  const foods = foodsQuery.data ?? [];
  const periods = periodsQuery.data ?? [];
  const activePeriod = periods.find((period) => period.end_at == null);
  const activeFood = foods.find((food) => food.id === activePeriod?.food_product_id);
  const otherFoods = foods.filter((food) => food.id !== activeFood?.id);
  const openFood = (food: ApiFoodProduct) => router.push(`/nutrition/foods/${food.id}/verify${food.verified_at ? '?focus=quantity' : ''}`);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />
      <Text style={styles.intro}>Qui trovi il cibo attuale di {dog.name} e quelli salvati in precedenza.</Text>
      <Button title="Aggiungi alimento" icon={<Ionicons name="add" size={18} color={colors.textOnPrimary} />} onPress={() => router.push('/nutrition/foods/new' as never)} />

      {activeFood ? <>
        <Text style={styles.sectionTitle}>Alimento attuale</Text>
        <FoodRow food={activeFood} active onOpen={() => openFood(activeFood)} onRemove={() => { setRemoveError(null); setPendingId(activeFood.id); }} />
      </> : null}
      {otherFoods.length ? <Text style={styles.sectionTitle}>Altri alimenti</Text> : null}
      {otherFoods.map((food) => <FoodRow key={food.id} food={food} active={false} onOpen={() => openFood(food)} onRemove={() => { setRemoveError(null); setPendingId(food.id); }} />)}
      {!foods.length ? <Text style={styles.emptyCopy}>Non hai ancora salvato alimenti.</Text> : null}

      <Modal transparent visible={pendingId !== null} animationType="fade" onRequestClose={() => { if (!removing) setPendingId(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rimuovere alimento?</Text>
            <Text style={styles.modalCopy}>Lo toglierò dall’elenco. Le osservazioni già registrate resteranno conservate.</Text>
            {removeError ? <Text style={styles.removeError}>{removeError}</Text> : null}
            <Button title="Rimuovi alimento" loading={removing} onPress={() => void removeFood()} />
            <Pressable disabled={removing} onPress={() => setPendingId(null)} style={styles.cancelAction}><Text style={styles.cancelLabel}>Annulla</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: typography.size.sm, color: colors.textSecondary, lineHeight: typography.size.sm * typography.lineHeight.relaxed, marginBottom: spacing.lg },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.bold },
  emptyCopy: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.lg },
  foodCard: { marginBottom: spacing.md, padding: spacing.md },
  activeCard: { borderWidth: 2, borderColor: colors.accent },
  pendingCard: { backgroundColor: colors.warningSoft },
  cardPressArea: { gap: spacing.sm },
  removeAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, alignSelf: 'flex-start', paddingVertical: spacing.xs },
  removeLabel: { color: colors.danger, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  foodHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  foodIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  foodTextWrap: { flex: 1 },
  foodBrand: { fontSize: typography.size.xs, color: colors.textSecondary },
  foodName: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(15,35,65,0.48)' },
  modalCard: { width: '100%', maxWidth: 380, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  modalTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
  modalCopy: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.lineHeight.relaxed, marginBottom: spacing.lg },
  removeError: { color: colors.danger, fontSize: typography.size.sm, marginBottom: spacing.md },
  cancelAction: { alignItems: 'center', padding: spacing.md },
  cancelLabel: { color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
});

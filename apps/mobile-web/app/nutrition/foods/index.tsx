/**
 * Elenco degli alimenti realmente salvati per il cane.
 * Gerarchia: alimento attivo in evidenza, poi gli altri.
 */
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { hapticLight } from '@/lib/haptics';
import Animated from 'react-native-reanimated';
import { usePressSpring } from '@/components/pressSpring';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSession } from '@/features/auth/SessionProvider';
import { useDogProfile } from '@/features/core/useDogProfile';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';
import { deleteFood, listFeedingPeriods, listFoods, type ApiFoodProduct } from '@/features/nutrition/api';

function ActiveFoodHero({
  food,
  onOpen,
  onRemove,
}: {
  food: ApiFoodProduct;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const imageUri = food.catalog_image_url || food.label_image_url || undefined;
  const press = usePressSpring();
  return (
    <View style={styles.heroCard}>
      <Animated.View style={press.style}>
      <Pressable accessibilityRole="button" onPress={onOpen} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={styles.heroPress}>
        <View style={styles.heroPack}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroImage}
              accessibilityLabel={`Foto di ${food.name || 'questo alimento'}`}
            />
          ) : (
            <LinearGradient
              colors={['#CCFBF1', '#DBEAFE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroFallback}
            >
              <Ionicons name="nutrition-outline" size={40} color={colors.accent} />
            </LinearGradient>
          )}
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.activePill}>
            <Text style={styles.activePillText}>Lo mangia adesso</Text>
          </View>
          <Text style={styles.heroBrand}>{food.brand || 'Marca da inserire'}</Text>
          <Text style={styles.heroName}>{food.name || 'Prodotto da verificare'}</Text>
          {food.verified_at === null ? (
            <Text style={styles.heroHint}>Da completare ›</Text>
          ) : (
            <Text style={styles.heroHint}>Apri dettagli ›</Text>
          )}
        </View>
      </Pressable>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rimuovi ${food.name || 'questo alimento'}`}
        onPress={onRemove}
        style={styles.removeAction}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.removeLabel}>Rimuovi</Text>
      </Pressable>
    </View>
  );
}

function FoodRow({
  food,
  onOpen,
  onRemove,
}: {
  food: ApiFoodProduct;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const imageUri = food.catalog_image_url || food.label_image_url || undefined;
  const press = usePressSpring();
  return (
    <View style={styles.rowCard}>
      <Animated.View style={press.style}>
      <Pressable accessibilityRole="button" onPress={onOpen} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={styles.rowPress}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.rowImage}
            accessibilityLabel={`Foto di ${food.name || 'questo alimento'}`}
          />
        ) : (
          <View style={styles.rowFallback}>
            <Ionicons name="nutrition-outline" size={22} color={colors.accent} />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowBrand}>{food.brand || 'Marca da inserire'}</Text>
          <Text style={styles.rowName} numberOfLines={2}>
            {food.name || 'Prodotto da verificare'}
          </Text>
          {food.verified_at === null ? (
            <Text style={styles.pendingLabel}>Da completare</Text>
          ) : (
            <Text style={styles.verifiedLabel}>Verificato</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rimuovi ${food.name || 'questo alimento'}`}
        onPress={onRemove}
        style={styles.removeAction}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.removeLabel}>Rimuovi</Text>
      </Pressable>
    </View>
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
  const activeFood = foods.find((food) => food.id === activePeriod?.food_product_id);
  const otherFoods = foods.filter((food) => food.id !== activeFood?.id);
  const openFood = (food: ApiFoodProduct) =>
    router.push(
      `/nutrition/foods/${food.id}/verify${food.verified_at ? '?focus=quantity' : ''}`,
    );

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Cibo di ${dog.name}`} />
      <Text style={styles.pageLead}>
        Quello che mangia adesso, e gli alimenti che hai già salvato.
      </Text>

      <Button
        title="Aggiungi alimento"
        icon={<Ionicons name="search-outline" size={18} color={colors.textOnPrimary} />}
        onPress={() => router.push('/nutrition/foods/new' as never)}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void hapticLight();
          router.push('/nutrition/foods/scan' as never);
        }}
        style={styles.manualLink}
      >
        <Ionicons name="camera-outline" size={16} color={colors.primary} />
        <Text style={styles.manualLinkText}>Non lo trovi? Fotografa la confezione</Text>
      </Pressable>

      {activeFood ? (
        <>
          <Text style={styles.sectionTitle}>Alimento attuale</Text>
          <ActiveFoodHero
            food={activeFood}
            onOpen={() => openFood(activeFood)}
            onRemove={() => {
              setRemoveError(null);
              setPendingId(activeFood.id);
            }}
          />
        </>
      ) : null}

      {otherFoods.length ? (
        <Text style={styles.sectionTitle}>Alimenti salvati</Text>
      ) : null}
      {otherFoods.map((food) => (
        <FoodRow
          key={food.id}
          food={food}
          onOpen={() => openFood(food)}
          onRemove={() => {
            setRemoveError(null);
            setPendingId(food.id);
          }}
        />
      ))}

      {!foods.length ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="nutrition-outline" size={30} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>La dispensa di {dog.name} è vuota</Text>
          <Text style={styles.emptyBody}>
            Aggiungi quello che mangia: la prossima volta basta un tap.
          </Text>
        </View>
      ) : null}

      <Modal
        transparent
        visible={pendingId !== null}
        animationType="fade"
        onRequestClose={() => {
          if (!removing) setPendingId(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rimuovere alimento?</Text>
            <Text style={styles.modalCopy}>
              Lo toglierò dall’elenco. Le osservazioni già registrate resteranno conservate.
            </Text>
            {removeError ? <Text style={styles.removeError}>{removeError}</Text> : null}
            <Button
              title="Rimuovi alimento"
              loading={removing}
              onPress={() => void removeFood()}
            />
            <Pressable
              disabled={removing}
              onPress={() => setPendingId(null)}
              style={styles.cancelAction}
            >
              <Text style={styles.cancelLabel}>Annulla</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  pageLead: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.35,
    marginTop: -4,
  },
  sectionTitle: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  heroPress: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  heroPack: {
    width: 108,
    height: 124,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, gap: 4, justifyContent: 'center' },
  heroBrand: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroName: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    lineHeight: typography.size.lg * 1.25,
  },
  heroHint: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    marginTop: 4,
  },
  activePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    marginBottom: 4,
  },
  activePillText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: typography.weight.bold,
  },
  rowCard: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowImage: {
    width: 64,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  rowFallback: {
    width: 64,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  rowText: { flex: 1, gap: 2 },
  rowBrand: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  rowName: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  pendingLabel: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    marginTop: 2,
  },
  verifiedLabel: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: typography.weight.bold,
    marginTop: 2,
  },
  removeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  removeLabel: {
    color: colors.danger,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(15,35,65,0.48)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  modalCopy: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.sm,
  },
  removeError: { color: colors.danger, fontSize: typography.size.sm },
  cancelAction: { alignItems: 'center', padding: spacing.md },
  cancelLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  manualLinkText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});

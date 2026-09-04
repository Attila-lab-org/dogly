/**
 * Food products (Spec V1 sez. 20): lista prodotti + cibo attivo.
 * Solo i campi verificati diventano dati durevoli: i prodotti non verificati
 * mostrano il badge "Da verificare" e portano alla schermata di verifica.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { feedingPeriodsMock, foodProductsMock } from '@/mocks/secondary';
import { StackScreenHeader } from '@/features/secondary/components';

export default function FoodsScreen() {
  const router = useRouter();
  const activePeriod = feedingPeriodsMock.find((f) => f.endedAt === null);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Cibo di Rocky" />
      <Text style={styles.intro}>
        Il cibo attivo viene collegato a ogni osservazione digestiva, così
        possiamo notare cambiamenti quando cambi alimentazione.
      </Text>

      {foodProductsMock.map((food) => {
        const isActive = activePeriod?.foodProductId === food.id;
        const verified = food.verifiedAt !== null;
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
                  <Text style={styles.foodBrand}>{food.brand}</Text>
                  <Text style={styles.foodName}>{food.name}</Text>
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
              {isActive && activePeriod?.quantityPerDay && (
                <Text style={styles.quantity}>
                  Quantità: {activePeriod.quantityPerDay} · dal{' '}
                  {new Date(activePeriod.startedAt).toLocaleDateString('it-IT')}
                </Text>
              )}
              {!verified && (
                <Text style={styles.verifyHint}>
                  Tocca per controllare i valori letti dall'etichetta prima
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

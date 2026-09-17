import React, { useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { Button, ScreenContainer } from '@/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import {
  activateFeedingPeriod,
  confirmExternalFood,
  createManualFood,
  lookupFoodByBarcode,
} from '@/features/nutrition/api';
import { StackScreenHeader } from '@/features/secondary/components';
import { queryKeys } from '@/lib/queryClient';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function NewFoodScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [treats, setTreats] = useState('');
  const [transition, setTransition] = useState('');
  const [activeNow, setActiveNow] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      const food = lookupId
        ? await confirmExternalFood({
            dogId: dog.id,
            lookupId,
            name,
            brand,
            activate: false,
          })
        : await createManualFood({
            dogId: dog.id,
            name,
            brand,
          });
      if (activeNow) {
        await activateFeedingPeriod({
          dogId: dog.id,
          foodId: food.id,
          quantityPerDay: quantity,
          treatsNotes: treats,
          transitionNotes: transition,
        });
      }
      if (userId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.foods(userId, dog.id),
        });
      }
      router.back();
    } catch {
      setError('Non sono riuscito a salvare l’alimento. Controlla e riprova.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Alimentazione di ${dog.name}`} />
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="nutrition-outline" size={24} color={colors.accent} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.title}>Cosa mangia?</Text>
          <Text style={styles.subtitle}>
            Bastano poche informazioni. Potrai aggiornarle quando cambia
            alimentazione.
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Nome dell’alimento</Text>
      <TextInput
        accessibilityLabel="Nome dell’alimento"
        value={name}
        onChangeText={setName}
        placeholder="Per esempio: crocchette al salmone"
        placeholderTextColor={colors.textMuted}
        maxLength={200}
        style={styles.input}
      />

      <Text style={styles.label}>Marca, se presente</Text>
      <TextInput
        accessibilityLabel="Marca dell’alimento"
        value={brand}
        onChangeText={setBrand}
        placeholder="Facoltativa"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
        style={styles.input}
      />

      <Text style={styles.label}>Codice a barre, se ce l’hai</Text>
      <TextInput
        accessibilityLabel="Codice a barre dell’alimento"
        value={barcode}
        onChangeText={(value) => {
          setBarcode(value);
          setLookupId(null);
          setAttribution(null);
        }}
        onEndEditing={() => {
          const cleaned = barcode.replace(/\D/g, '');
          if (cleaned.length < 8 || !dog.id) return;
          void lookupFoodByBarcode({ dogId: dog.id, barcode: cleaned })
            .then((candidate) => {
              setLookupId(candidate.lookup_id);
              setAttribution(candidate.attribution);
              if (candidate.name && !name.trim()) setName(candidate.name);
              if (candidate.brand && !brand.trim()) setBrand(candidate.brand);
            })
            .catch(() => {
              setLookupId(null);
              setAttribution(null);
            });
        }}
        placeholder="Facoltativo"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={32}
        style={styles.input}
      />
      {attribution ? <Text style={styles.subtitle}>{attribution}</Text> : null}

      <View style={styles.activeRow}>
        <View style={styles.activeCopy}>
          <Text style={styles.activeTitle}>È ciò che mangia adesso</Text>
          <Text style={styles.activeHint}>
            Le prossime osservazioni digestive verranno collegate a questo
            alimento.
          </Text>
        </View>
        <Switch
          accessibilityLabel="È l’alimento attuale"
          value={activeNow}
          onValueChange={setActiveNow}
          trackColor={{ false: colors.border, true: colors.accentSoft }}
          thumbColor={activeNow ? colors.accent : colors.textMuted}
        />
      </View>

      {activeNow ? (
        <>
          <Text style={styles.label}>Quantità giornaliera</Text>
          <TextInput
            accessibilityLabel="Quantità giornaliera"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Per esempio: 280 g al giorno"
            placeholderTextColor={colors.textMuted}
            maxLength={120}
            style={styles.input}
          />
          <Text style={styles.label}>Snack o extra abituali</Text>
          <TextInput
            accessibilityLabel="Snack o extra abituali"
            value={treats}
            onChangeText={setTreats}
            placeholder="Facoltativo"
            placeholderTextColor={colors.textMuted}
            maxLength={240}
            style={styles.input}
          />
          <Text style={styles.label}>Cambio recente</Text>
          <TextInput
            accessibilityLabel="Note sul cambio di alimento"
            value={transition}
            onChangeText={setTransition}
            placeholder="Per esempio: iniziato gradualmente tre giorni fa"
            placeholderTextColor={colors.textMuted}
            maxLength={240}
            style={[styles.input, styles.notesInput]}
            multiline
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={activeNow ? `Salva per ${dog.name}` : 'Salva alimento'}
        loading={working}
        disabled={!name.trim()}
        onPress={() => void save()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  introIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
  },
  introCopy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  label: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  activeCopy: {
    flex: 1,
  },
  activeTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  activeHint: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  error: {
    marginVertical: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.sm,
  },
});

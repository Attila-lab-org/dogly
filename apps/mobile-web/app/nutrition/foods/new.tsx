import React, { useEffect, useState } from 'react';
import {
  Pressable,
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
  searchFoodsByName,
  type ExternalFoodCandidate,
} from '@/features/nutrition/api';
import { StackScreenHeader } from '@/features/secondary/components';
import { queryKeys } from '@/lib/queryClient';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function NewFoodScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ExternalFoodCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [treats, setTreats] = useState('');
  const [transition, setTransition] = useState('');
  const [activeNow, setActiveNow] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = (raw: string) => {
    const cleaned = raw.trim();
    if (cleaned.length < 3 || lookupId || !dog.id || searching) {
      return;
    }
    setSearching(true);
    setSearchError(null);
    void searchFoodsByName({ dogId: dog.id, query: cleaned })
      .then((result) => {
        setHits(result.items);
        setAttribution(result.attribution);
        if (result.items.length === 0) {
          setSearchError('Nessun alimento in elenco. Puoi scriverlo tu.');
        }
      })
      .catch(() => {
        setHits([]);
        setSearchError(
          'Il catalogo non ha risposto. Puoi inserire nome e marca a mano.',
        );
      })
      .finally(() => setSearching(false));
  };

  useEffect(() => {
    const cleaned = query.trim();
    if (cleaned.length < 3 || lookupId || !dog.id) {
      return;
    }
    const handle = setTimeout(() => runSearch(cleaned), 700);
    return () => clearTimeout(handle);
  }, [dog.id, lookupId, query]);

  const pickHit = (item: ExternalFoodCandidate) => {
    setLookupId(item.lookup_id);
    setName(item.name ?? '');
    setBrand(item.brand ?? '');
    setBarcode(item.barcode);
    setHits([]);
    setSearchError(null);
    setQuery([item.brand, item.name].filter(Boolean).join(' · '));
  };

  const clearPick = () => {
    setLookupId(null);
    setHits([]);
    setAttribution(null);
  };

  const lookupBarcode = () => {
    const cleaned = barcode.replace(/\D/g, '');
    if (cleaned.length < 8 || !dog.id) return;
    setWorking(true);
    setError(null);
    void lookupFoodByBarcode({ dogId: dog.id, barcode: cleaned })
      .then((candidate) => {
        setLookupId(candidate.lookup_id);
        setAttribution(candidate.attribution);
        setName(candidate.name ?? name);
        setBrand(candidate.brand ?? brand);
        setHits([]);
        setSearchError(null);
      })
      .catch(() => {
        setLookupId(null);
        setError('Non ho trovato questo codice. Prova a cercarlo per nome.');
      })
      .finally(() => setWorking(false));
  };

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
          <Ionicons name="search-outline" size={24} color={colors.accent} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.title}>Cerca cosa mangia</Text>
          <Text style={styles.subtitle}>
            Scrivi marca o nome e scegli dall’elenco. Se non c’è, lo inserisci
            tu.
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Cerca nell’elenco</Text>
      <View style={styles.barcodeRow}>
        <TextInput
          accessibilityLabel="Cerca alimento"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            if (lookupId) clearPick();
          }}
          placeholder="Per esempio: Royal Canin salmone"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
          style={[styles.input, styles.barcodeInput]}
        />
        <Button
          title="Cerca"
          variant="outline"
          disabled={query.trim().length < 3 || searching || !dog.id}
          onPress={() => runSearch(query)}
        />
      </View>
      {searching ? (
        <Text style={styles.hint}>Cerco nell’elenco…</Text>
      ) : null}
      {searchError ? <Text style={styles.hint}>{searchError}</Text> : null}

      {hits.map((item) => (
        <Pressable
          key={item.lookup_id}
          accessibilityRole="button"
          accessibilityLabel={`${item.brand ?? ''} ${item.name ?? ''}`}
          onPress={() => pickHit(item)}
          style={styles.hit}
        >
          <View style={styles.hitCopy}>
            <Text style={styles.hitBrand}>{item.brand || 'Marca non indicata'}</Text>
            <Text style={styles.hitName}>{item.name}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}

      {lookupId ? (
        <View style={styles.picked}>
          <Ionicons name="checkmark-circle" size={20} color={colors.teal} />
          <Text style={styles.pickedText}>
            Trovato nell’elenco. Controlla il nome e salva.
          </Text>
        </View>
      ) : null}

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

      <Text style={styles.label}>Oppure cerca per codice a barre</Text>
      <View style={styles.barcodeRow}>
        <TextInput
          accessibilityLabel="Codice a barre dell’alimento"
          value={barcode}
          onChangeText={(value) => {
            setBarcode(value);
            if (lookupId) clearPick();
          }}
          placeholder="Facoltativo"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={32}
          style={[styles.input, styles.barcodeInput]}
        />
        <Button
          title="Cerca"
          variant="outline"
          disabled={barcode.replace(/\D/g, '').length < 8 || working}
          onPress={lookupBarcode}
        />
      </View>
      {attribution ? <Text style={styles.hint}>{attribution}</Text> : null}

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
  hint: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
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
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barcodeInput: {
    flex: 1,
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hitCopy: {
    flex: 1,
  },
  hitBrand: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  hitName: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  pickedText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
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

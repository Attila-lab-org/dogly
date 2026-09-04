/**
 * Onboarding cane (Spec V1 sez. 7.1.2) — profilo in ≤60 secondi, una schermata.
 * - Nome obbligatorio; età/life stage (anche approssimativa) e taglia;
 * - razza/mix/sconosciuta opzionale; foto opzionale.
 * Stati obbligatori (sez. 6): valid, unknown breed, no photo, approximate age.
 * Validazione con zod (schema condiviso, pronto a essere spostato lato
 * contratti quando il backend espone POST /v1/dogs).
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';

const LIFE_STAGES = ['Cucciolo', 'Adulto', 'Anziano'] as const;
const SIZES = ['Piccola', 'Media', 'Grande'] as const;

const dogSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è necessario: lo userò in tutta l’app.'),
  lifeStage: z.enum(LIFE_STAGES),
  size: z.enum(SIZES),
  /** Età approssimativa ammessa (sez. 6: "approximate age") */
  approximateAge: z.string().trim().max(20).optional(),
  /** Razza libera, "Mix" o unknown (sez. 6: "unknown breed") */
  breed: z.string().trim().max(60).optional(),
  breedUnknown: z.boolean(),
  /** Foto opzionale (sez. 6: "no photo") */
  photoUri: z.string().nullable(),
});

type DogDraft = z.infer<typeof dogSchema>;

export default function DogOnboardingScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<DogDraft>({
    name: '',
    lifeStage: 'Adulto',
    size: 'Media',
    approximateAge: '',
    breed: '',
    breedUnknown: false,
    photoUri: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (partial: Partial<DogDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const submit = () => {
    const parsed = dogSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Controlla i campi e riprova.');
      return;
    }
    setError(null);
    setSaving(true);
    // Mock V1: POST /v1/dogs (sez. 9) creerà il profilo versionato; qui
    // instradiamo al passo 7.1.3 (Home con cold-start copy).
    setTimeout(() => router.replace('/(tabs)/home'), 600);
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Crea il profilo del tuo cane</Text>
      <Text style={styles.subtitle}>
        Bastano pochi secondi: nome e taglia, il resto possiamo scoprirlo
        insieme.
      </Text>

      {/* Foto opzionale con placeholder zampa */}
      <View style={styles.avatarSection}>
        <DogAvatar size={104} photoUri={draft.photoUri} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiungi foto del cane"
          onPress={() =>
            // Mock V1: il picker foto arriverà con l'upload firmato
            // (bucket dog-avatars, sez. 12.1); fino ad allora lo stato
            // "no photo" (sez. 6) resta valido e il profilo si crea senza.
            Alert.alert(
              'Foto di Rocky',
              'Funzione foto in arrivo: per ora puoi continuare senza, la potrai aggiungere dal profilo.',
            )
          }
          style={styles.photoBadge}
        >
          <Ionicons name="camera" size={16} color={colors.primary} />
        </Pressable>
        <Text style={styles.photoHint}>Foto (facoltativa)</Text>
      </View>

      {/* Nome — obbligatorio */}
      <Text style={styles.label}>Nome *</Text>
      <TextInput
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        placeholder="Es. Rocky"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCapitalize="words"
        testID="onboarding-name"
      />

      {/* Life stage + età approssimativa */}
      <Text style={styles.label}>Età</Text>
      <View style={styles.chips}>
        {LIFE_STAGES.map((stage) => (
          <OptionChip
            key={stage}
            label={stage}
            selected={draft.lifeStage === stage}
            onPress={() => patch({ lifeStage: stage })}
          />
        ))}
      </View>
      <TextInput
        value={draft.approximateAge}
        onChangeText={(approximateAge) => patch({ approximateAge })}
        placeholder="Età approssimativa (es. circa 4 anni)"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        testID="onboarding-age"
      />

      {/* Taglia */}
      <Text style={styles.label}>Taglia</Text>
      <View style={styles.chips}>
        {SIZES.map((size) => (
          <OptionChip
            key={size}
            label={size}
            selected={draft.size === size}
            onPress={() => patch({ size })}
          />
        ))}
      </View>

      {/* Razza opzionale / sconosciuta */}
      <Text style={styles.label}>Razza (facoltativa)</Text>
      <TextInput
        value={draft.breedUnknown ? '' : draft.breed}
        onChangeText={(breed) => patch({ breed, breedUnknown: false })}
        placeholder="Es. Labrador, Mix…"
        placeholderTextColor={colors.textMuted}
        editable={!draft.breedUnknown}
        style={[styles.input, draft.breedUnknown && styles.inputDisabled]}
        testID="onboarding-breed"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ checked: draft.breedUnknown }}
        onPress={() =>
          patch({ breedUnknown: !draft.breedUnknown, breed: '' })
        }
        style={styles.unknownRow}
      >
        <Ionicons
          name={draft.breedUnknown ? 'checkbox' : 'square-outline'}
          size={20}
          color={draft.breedUnknown ? colors.primary : colors.textMuted}
        />
        <Text style={styles.unknownText}>Non la conosco</Text>
      </Pressable>

      {error && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Button
        title="Inizia a capirlo"
        loading={saving}
        onPress={submit}
        style={styles.submit}
        testID="onboarding-submit"
      />
      <Text style={styles.footer}>
        Potrai sempre modificare questi dati dal profilo.
      </Text>
    </ScreenContainer>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.optionChip, selected && styles.optionChipSelected]}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    marginBottom: spacing.xl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  photoBadge: {
    position: 'absolute',
    top: 76,
    marginLeft: 80,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoHint: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.size.md,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  optionLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  optionLabelSelected: {
    color: colors.primary,
  },
  unknownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  unknownText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  submit: {
    marginTop: spacing.xl,
  },
  footer: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

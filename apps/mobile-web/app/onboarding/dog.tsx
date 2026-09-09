/**
 * Onboarding cane (Spec V1 sez. 7.1.2) — profilo in ≤60 secondi, una schermata.
 * - Nome obbligatorio; età/life stage (anche approssimativa) e taglia;
 * - razza/mix/sconosciuta opzionale; foto opzionale.
 * Stati obbligatori (sez. 6): valid, unknown breed, no photo, approximate age.
 * Validazione con zod (schema condiviso, pronto a essere spostato lato
 * contratti quando il backend espone POST /v1/dogs).
 */
import React, { useEffect, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import {
  profileToCreateBody,
  useCreateDogMutation,
} from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { dogsQueryKey } from '@/features/dogs/api';
import { persistDogAvatar } from '@/features/dogs/avatar';
import { pickAvatarPhoto } from '@/features/photos/share';
import { BreedPicker } from '@/features/dogs/BreedPicker';
import {
  breedLabelFromSelection,
  type BreedSelection,
} from '@/features/dogs/breeds';
import {
  AgePicker,
  BirthdayPicker,
} from '@/features/dogs/AgeBirthdayPicker';
import {
  ageFromBirthDate,
  ageLabelFromYears,
} from '@/features/dogs/profileDates';

const SIZES = ['Piccola', 'Media', 'Grande'] as const;

const dogSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è necessario: lo userò in tutta l’app.'),
  size: z.enum(SIZES),
  weightKg: z.string().trim().refine(
    (value) => {
      if (!value) return true;
      const weight = Number(value.replace(',', '.'));
      return Number.isFinite(weight) && weight > 0 && weight <= 999.99;
    },
    'Inserisci un peso valido in kg.',
  ),
  /** Foto opzionale (sez. 6: "no photo") */
  photoUri: z.string().nullable(),
});

type DogDraft = z.infer<typeof dogSchema>;

export default function DogOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { usingMockGate, markDogCreated, userId, hasDog, refreshDogs } =
    useSession();
  const createDog = useCreateDogMutation();
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [draft, setDraft] = useState<DogDraft>({
    name: '',
    size: 'Media',
    weightKg: '',
    photoUri: null,
  });
  const [ageYears, setAgeYears] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [breedSelection, setBreedSelection] = useState<BreedSelection>({
    kind: 'unselected',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshDogs();
  }, [refreshDogs]);

  useEffect(() => {
    if (hasDog) {
      router.replace('/(tabs)/home');
    }
  }, [hasDog, router]);

  const patch = (partial: Partial<DogDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const submit = async () => {
    if (ageYears === null) {
      setError('Seleziona l’età.');
      return;
    }
    const parsed = dogSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Controlla i campi e riprova.');
      return;
    }
    setError(null);
    const breedLabel = breedLabelFromSelection(breedSelection);
    const sizeLabel =
      parsed.data.size === 'Piccola'
        ? 'Taglia piccola'
        : parsed.data.size === 'Grande'
          ? 'Taglia grande'
          : 'Taglia media';
    const ageLabel = ageLabelFromYears(ageYears);

    try {
      if (usingMockGate) {
        markDogCreated('dog-rocky');
        router.replace('/(tabs)/home');
        return;
      }
      const dog = await createDog.mutateAsync(
        profileToCreateBody(
          {
            name: parsed.data.name,
            birthDate,
            sizeLabel,
            weightKg: parsed.data.weightKg
              ? Number(parsed.data.weightKg.replace(',', '.'))
              : null,
            breedLabel,
            isMix: breedSelection.kind === 'mixed',
            ageLabel,
          },
          `dog-create-${Date.now()}`,
        ),
      );
      markDogCreated(dog.id);
      if (parsed.data.photoUri) {
        setSavingPhoto(true);
        try {
          await persistDogAvatar(dog.id, parsed.data.photoUri);
          if (userId) {
            await queryClient.invalidateQueries({ queryKey: dogsQueryKey(userId) });
          }
        } catch (photoError) {
          const detail =
            photoError instanceof Error
              ? photoError.message
              : 'Errore sconosciuto';
          Alert.alert(
            'Profilo salvato senza foto',
            `${detail}\nPuoi riprovare da Modifica profilo.`,
          );
        } finally {
          setSavingPhoto(false);
        }
      }
      router.replace('/(tabs)/home');
    } catch (saveError) {
      const detail =
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'Controlla la connessione e riprova.';
      if (detail.includes('limited number of active dogs')) {
        setError(
          'Su questo account c’è già un cane. Il piano attuale ne permette uno solo.',
        );
        void refreshDogs();
        return;
      }
      setError(`Non sono riuscito a salvare il profilo. ${detail}`);
    }
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
          onPress={async () => {
            const uri = await pickAvatarPhoto();
            if (uri) patch({ photoUri: uri });
          }}
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

      <Text style={styles.label}>Età</Text>
      <View style={styles.profileField}>
        <AgePicker
          value={ageYears}
          onChange={(years) => {
            setAgeYears(years);
            setBirthDate(null);
          }}
          testID="onboarding-age"
        />
      </View>

      <Text style={styles.label}>Compleanno (facoltativo)</Text>
      <View style={styles.profileField}>
        <BirthdayPicker
          value={birthDate}
          ageYears={ageYears}
          onChange={(date) => {
            setBirthDate(date);
            if (date) setAgeYears(ageFromBirthDate(date));
          }}
          testID="onboarding-birthday"
        />
      </View>

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

      <Text style={styles.label}>Peso (kg, facoltativo)</Text>
      <TextInput
        value={draft.weightKg}
        onChangeText={(weightKg) => patch({ weightKg })}
        placeholder="Es. 12,5"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={styles.input}
        testID="onboarding-weight"
      />

      <Text style={styles.label}>Razza</Text>
      <BreedPicker
        value={breedSelection}
        onChange={setBreedSelection}
        testID="onboarding-breed"
      />

      {error && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Button
        title="Inizia a capirlo"
        loading={createDog.isPending || savingPhoto}
        onPress={() => void submit()}
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
  profileField: {
    marginBottom: spacing.sm,
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

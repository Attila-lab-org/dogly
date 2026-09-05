/**
 * Modifica profilo cane — PATCH /v1/dogs/{id} via react-query.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import {
  profileToUpdateBody,
  useDogProfile,
  useUpdateDogMutation,
} from '@/features/core/useDogProfile';
import { persistDogAvatar } from '@/features/dogs/avatar';
import { useSession } from '@/features/auth/SessionProvider';
import { StackScreenHeader } from '@/features/secondary/components';
import { pickAvatarPhoto } from '@/features/photos/share';
import { BreedPicker } from '@/features/dogs/BreedPicker';
import {
  breedLabelFromSelection,
  breedSelectionFromLabel,
} from '@/features/dogs/breeds';
import {
  AgePicker,
  BirthdayPicker,
} from '@/features/dogs/AgeBirthdayPicker';
import {
  ageFromBirthDate,
  ageLabelFromYears,
  ageYearsFromLabel,
} from '@/features/dogs/profileDates';
import { setProfileVisibility as apiSetVisibility } from '@/features/photos/api';

const SIZES = ['Taglia piccola', 'Taglia media', 'Taglia grande'] as const;

export default function DogEditScreen() {
  const router = useRouter();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const updateMutation = useUpdateDogMutation(dogId ?? dog.id);
  const [name, setName] = useState(dog.name);
  const [ageYears, setAgeYears] = useState<number | null>(
    dog.birthDate
      ? ageFromBirthDate(dog.birthDate)
      : ageYearsFromLabel(dog.ageLabel),
  );
  const [birthDate, setBirthDate] = useState(dog.birthDate);
  const [sizeLabel, setSizeLabel] = useState(dog.sizeLabel);
  const [weightKg, setWeightKg] = useState(
    dog.weightKg === null ? '' : String(dog.weightKg).replace('.', ','),
  );
  const [breedSelection, setBreedSelection] = useState(
    breedSelectionFromLabel(dog.breedLabel),
  );
  const [photoUri, setPhotoUri] = useState(dog.photoUri);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState(
    dog.profileVisibility,
  );

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Nome richiesto', 'Il nome del cane è obbligatorio.');
      return;
    }
    if (ageYears === null) {
      Alert.alert('Età richiesta', 'Seleziona l’età.');
      return;
    }
    const breedLabel = breedLabelFromSelection(breedSelection);
    const ageLabel = ageLabelFromYears(ageYears);
    const parsedWeight = weightKg.trim()
      ? Number(weightKg.trim().replace(',', '.'))
      : null;
    if (
      parsedWeight !== null &&
      (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 999.99)
    ) {
      Alert.alert('Peso non valido', 'Inserisci un peso valido in kg.');
      return;
    }

    try {
      if (!usingMockGate && dogId) {
        await updateMutation.mutateAsync(
          profileToUpdateBody({
            name: name.trim(),
            ageLabel,
            birthDate,
            sizeLabel,
            weightKg: parsedWeight,
            breedLabel,
            isMix: breedSelection.kind === 'mixed',
          }),
        );
        await apiSetVisibility(
          dogId,
          profileVisibility === 'public' ? 'PUBLIC' : 'PRIVATE',
          profileVisibility === 'public' ? 'public-profile-v1' : undefined,
        );
      }
      router.back();
    } catch {
      Alert.alert(
        'Salvataggio non riuscito',
        'Controlla la connessione e riprova.',
      );
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Modifica profilo" />
      <Text style={styles.hint}>Profilo di {dog.name} · id {dogId}</Text>

      <View style={styles.avatarSection}>
        <DogAvatar size={112} photoUri={photoUri} dogName={name || dog.name} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambia foto"
          hitSlop={8}
          onPress={async () => {
            const uri = await pickAvatarPhoto();
            if (!uri) return;
            setPhotoUri(uri);
            if (usingMockGate || !dogId) return;
            setUploadingPhoto(true);
            try {
              const savedUrl = await persistDogAvatar(dogId, uri);
              if (savedUrl) setPhotoUri(savedUrl);
              Alert.alert('Foto salvata', 'La foto profilo è stata caricata.');
            } catch (error) {
              const detail =
                error instanceof Error ? error.message : 'Errore sconosciuto';
              Alert.alert('Foto non salvata', detail);
            } finally {
              setUploadingPhoto(false);
            }
          }}
          style={styles.photoBadge}
        >
          <Ionicons name="camera" size={16} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Età</Text>
      <View style={styles.profileField}>
        <AgePicker
          value={ageYears}
          onChange={(years) => {
            setAgeYears(years);
            setBirthDate(null);
          }}
          testID="edit-age"
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
          testID="edit-birthday"
        />
      </View>

      <Text style={styles.label}>Taglia</Text>
      <View style={styles.chips}>
        {SIZES.map((size) => (
          <Pressable
            key={size}
            onPress={() => setSizeLabel(size)}
            style={[styles.chip, sizeLabel === size && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                sizeLabel === size && styles.chipTextActive,
              ]}
            >
              {size}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Peso (kg, facoltativo)</Text>
      <TextInput
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="decimal-pad"
        placeholder="Es. 12,5"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Razza</Text>
      <View style={styles.breedField}>
        <BreedPicker
          value={breedSelection}
          onChange={setBreedSelection}
          testID="edit-breed"
        />
      </View>

      <Text style={styles.label}>Visibilità profilo</Text>
      <Text style={styles.visibilityHint}>
        Privato di default. Il profilo pubblico è opt-in e richiede consenso
        esplicito (revocabile subito).
      </Text>
      <View style={styles.chips}>
        {(
          [
            ['private', 'Privato'],
            ['public', 'Pubblico'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: profileVisibility === value }}
            onPress={() => {
              if (value === 'public') {
                Alert.alert(
                  'Profilo pubblico',
                  'Verranno mostrati solo campi whitelist (nome, età, taglia, razza). Puoi revocare in qualsiasi momento.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    {
                      text: 'Confermo',
                      onPress: () => setProfileVisibility('public'),
                    },
                  ],
                );
              } else {
                setProfileVisibility('private');
              }
            }}
            style={[
              styles.chip,
              profileVisibility === value && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                profileVisibility === value && styles.chipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Button
        title="Salva"
        loading={updateMutation.isPending || uploadingPhoto}
        disabled={uploadingPhoto}
        onPress={() => void save()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  avatarSection: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  photoBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    fontSize: typography.size.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  breedField: {
    marginBottom: spacing.lg,
  },
  profileField: {
    marginBottom: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  visibilityHint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
});

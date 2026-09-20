/**
 * Modifica profilo cane — PATCH /v1/dogs/{id} via react-query.
 */
import React, { useEffect, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import {
  useDogProfile,
  useUpdateDogMutation,
} from '@/features/core/useDogProfile';
import { profileChangesToUpdateBody } from '@/features/dogs/profilePatch';
import { isLocalPhotoUri, persistDogAvatar } from '@/features/dogs/avatar';
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
import { dogsQueryKey } from '@/features/dogs/api';
import { SEX_OPTIONS, type DogSex } from '@/features/dogs/map';
import { setProfileVisibility as apiSetVisibility } from '@/features/photos/api';
import { useMeProfile, useUpdateMeProfile } from '@/features/me/api';

const SIZES = ['Taglia piccola', 'Taglia media', 'Taglia grande'] as const;

export default function DogEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const routeDogId = Array.isArray(params.dogId) ? params.dogId[0] : params.dogId;
  const dogId = routeDogId ?? dog.id;
  const updateMutation = useUpdateDogMutation(dogId);
  const meQuery = useMeProfile();
  const updateMe = useUpdateMeProfile();
  const [ownerName, setOwnerName] = useState(
    meQuery.data?.display_name ?? '',
  );
  const [name, setName] = useState(dog.name);
  const [sex, setSex] = useState<DogSex | null>(dog.sex);
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
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState(
    dog.profileVisibility,
  );

  useEffect(() => {
    if (!pendingPhotoUri && !uploadingPhoto) {
      setPhotoUri(dog.photoUri);
    }
  }, [dog.photoUri, pendingPhotoUri, uploadingPhoto]);

  useEffect(() => {
    if (meQuery.data?.display_name != null) {
      setOwnerName(meQuery.data.display_name);
    }
  }, [meQuery.data?.display_name]);

  const selectAndUploadPhoto = async () => {
    const uri = await pickAvatarPhoto();
    if (!uri) return;
    setPhotoUri(uri);
    setPendingPhotoUri(uri);
    if (!dogId) {
      Alert.alert('Foto non salvata', 'Profilo del cane non disponibile.');
      return;
    }

    setUploadingPhoto(true);
    try {
      const savedUrl = await persistDogAvatar(dogId, uri);
      if (savedUrl) setPhotoUri(savedUrl);
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: dogsQueryKey(userId) });
      }
      setPendingPhotoUri(null);
      Alert.alert('Foto salvata', 'La foto profilo è stata caricata.');
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Errore sconosciuto';
      Alert.alert('Foto non salvata', detail);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    let photoUploadedOnSave = false;
    if (
      dogId &&
      photoUri &&
      isLocalPhotoUri(photoUri)
    ) {
      setUploadingPhoto(true);
      try {
        const savedUrl = await persistDogAvatar(dogId, photoUri);
        if (savedUrl) setPhotoUri(savedUrl);
        if (userId) {
          await queryClient.invalidateQueries({ queryKey: dogsQueryKey(userId) });
        }
        setPendingPhotoUri(null);
        photoUploadedOnSave = true;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Errore sconosciuto';
        Alert.alert('Foto non salvata', detail);
        return;
      } finally {
        setUploadingPhoto(false);
      }
    }
    if (pendingPhotoUri && !photoUploadedOnSave) {
      Alert.alert(
        'Foto non ancora salvata',
        'Tocca nuovamente la foto e completa il caricamento prima di uscire.',
      );
      return;
    }
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
      const nextOwnerName = ownerName.trim() || null;
      const currentOwnerName = meQuery.data?.display_name ?? null;
      if (userId && nextOwnerName !== currentOwnerName) {
        await updateMe.mutateAsync({ display_name: nextOwnerName });
      }
      if (dogId) {
        const profilePatch = profileChangesToUpdateBody(dog, {
          name: name.trim(),
          sex,
          ageLabel,
          birthDate,
          sizeLabel,
          weightKg: parsedWeight,
          breedLabel,
          isMix: breedSelection.kind === 'mixed',
        });
        if (Object.keys(profilePatch).length > 0) {
          await updateMutation.mutateAsync(profilePatch);
        }
        if (profileVisibility !== dog.profileVisibility) {
          try {
            await apiSetVisibility(
              dogId,
              profileVisibility === 'public' ? 'PUBLIC' : 'PRIVATE',
              profileVisibility === 'public' ? 'public-profile-v1' : undefined,
            );
          } catch {
            Alert.alert(
              'Visibilità non aggiornata',
              'Il profilo è salvato, ma la visibilità non è stata aggiornata. Controlla la connessione e riprova.',
            );
            return;
          }
        }
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
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Modifica profilo" />

      <Text style={styles.sectionTitle}>Tu</Text>
      <Text style={styles.label}>Nome con cui DOGly ti chiama</Text>
      <TextInput
        value={ownerName}
        onChangeText={setOwnerName}
        placeholder="Es. Attila"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        style={styles.input}
        testID="owner-display-name"
      />

      <Text style={styles.sectionTitle}>{name.trim() || dog.name}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambia foto profilo"
        disabled={uploadingPhoto}
        onPress={() => void selectAndUploadPhoto()}
        style={styles.avatarSection}
      >
        <View style={styles.avatarHalo}>
          <DogAvatar size={112} photoUri={photoUri} dogName={name || dog.name} />
        </View>
        <View style={styles.photoBadge}>
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </View>
      </Pressable>
      <Text style={styles.photoStatus}>
        {uploadingPhoto
          ? 'Caricamento foto in corso…'
          : 'Tocca per cambiare la foto profilo'}
      </Text>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Sesso</Text>
      <View style={styles.chips}>
        {SEX_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: sex === option.value }}
            onPress={() => setSex(option.value)}
            style={[styles.chip, sex === option.value && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                sex === option.value && styles.chipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

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
        variant="secondary"
        loading={
          updateMutation.isPending || updateMe.isPending || uploadingPhoto
        }
        disabled={uploadingPhoto}
        onPress={() => void save()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#1A2B48',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  avatarSection: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  avatarHalo: {
    borderWidth: 4,
    borderColor: '#FFFFFF',
    borderRadius: 60,
    ...shadows.card,
  },
  photoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.teal,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  photoStatus: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#1A2B48',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    fontSize: typography.size.md,
    color: '#1A2B48',
    backgroundColor: '#FFFFFF',
    minHeight: 52,
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: '#F1F5F9',
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.teal,
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.weight.semibold,
  },
  visibilityHint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
});

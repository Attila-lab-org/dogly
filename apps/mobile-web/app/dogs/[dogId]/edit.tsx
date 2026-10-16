/**
 * Modifica profilo cane — PATCH /v1/dogs/{id} via react-query.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import {
  useDogProfile,
  useUpdateDogMutation,
} from '@/features/core/useDogProfile';
import { profileChangesToUpdateBody } from '@/features/dogs/profilePatch';
import { isLocalPhotoUri, persistDogAvatar } from '@/features/dogs/avatar';
import { useSession } from '@/features/auth/SessionProvider';
import { useAvatarPalette } from '@/features/dogs/avatarTint';
import { StackScreenHeader } from '@/features/secondary/components';
import { pickAvatarPhoto } from '@/features/photos/share';
import { BreedPicker } from '@/features/dogs/BreedPicker';
import { SpringPress } from '@/components/pressSpring';
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
import { dogsQueryKey, type ApiDog } from '@/features/dogs/api';
import { SEX_OPTIONS, type DogSex } from '@/features/dogs/map';
import {
  getProfileVisibility,
  profileVisibilityQueryKey,
  setProfileVisibility as apiSetVisibility,
} from '@/features/photos/api';
import { confirmPublicProfile } from '@/lib/confirmAction';
import {
  useMeProfile,
  useUpdateMeProfile,
  type AskVoiceGender,
} from '@/features/me/api';

const SIZES = ['Taglia piccola', 'Taglia media', 'Taglia grande'] as const;
const VOICE_OPTIONS: { value: AskVoiceGender; label: string; hint: string }[] = [
  { value: 'FEMALE', label: 'Femminile', hint: 'Luminosa e chiara' },
  { value: 'MALE', label: 'Maschile', hint: 'Calda e posata' },
];

const SEX_META: Record<DogSex, {
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  iconColor: string;
}> = {
  MALE: { hint: 'Profilo maschile', icon: 'male', tint: '#E4F1FF', iconColor: '#3276C8' },
  FEMALE: { hint: 'Profilo femminile', icon: 'female', tint: '#FFE7F0', iconColor: '#D45D8A' },
  UNKNOWN: { hint: 'Da scegliere', icon: 'help-circle-outline', tint: '#EEF2F7', iconColor: '#708096' },
};

export default function DogEditScreen() {
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const routeDogId = Array.isArray(params.dogId) ? params.dogId[0] : params.dogId;
  const { dog } = useDogProfile(routeDogId);
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const dogId = routeDogId ?? dog.id;
  const updateMutation = useUpdateDogMutation(dogId);
  const meQuery = useMeProfile();
  const updateMe = useUpdateMeProfile();
  const [ownerName, setOwnerName] = useState(
    meQuery.data?.display_name ?? '',
  );
  const [voiceGender, setVoiceGender] = useState<AskVoiceGender>(
    meQuery.data?.ask_voice_gender === 'MALE' ? 'MALE' : 'FEMALE',
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const palette = useAvatarPalette(dogId, photoUri);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const changeVersionRef = useRef(0);
  const markDirty = () => { changeVersionRef.current += 1; dirtyRef.current = true; setSaveState('idle'); };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      setFeedback(`${title}: ${message}`);
      return;
    }
    Alert.alert(title, message);
  };
  const [profileVisibility, setProfileVisibility] = useState(
    dog.profileVisibility,
  );
  const [savedProfileVisibility, setSavedProfileVisibility] = useState(
    dog.profileVisibility,
  );
  const visibilityQuery = useQuery({
    queryKey: profileVisibilityQueryKey(dogId),
    queryFn: () => getProfileVisibility(dogId),
    enabled: Boolean(dogId),
  });

  useEffect(() => {
    const visibility = visibilityQuery.data;
    if (!visibility) return;
    const next = visibility.visibility === 'PUBLIC' ? 'public' : 'private';
    setProfileVisibility(next);
    setSavedProfileVisibility(next);
  }, [visibilityQuery.data]);

  const applyAvatarToCache = (photoUrl: string | null) => {
    if (!userId || !photoUrl) return;
    queryClient.setQueryData<ApiDog[]>(dogsQueryKey(userId), (current) =>
      current?.map((item) =>
        item.id === dogId ? { ...item, photo_url: photoUrl } : item,
      ),
    );
  };

  useEffect(() => {
    if (!pendingPhotoUri && !uploadingPhoto) {
      setPhotoUri(dog.photoUri);
    }
  }, [dog.photoUri, pendingPhotoUri, uploadingPhoto]);

  useEffect(() => {
    if (meQuery.data?.display_name != null) {
      setOwnerName(meQuery.data.display_name);
    }
    if (meQuery.data?.ask_voice_gender) {
      setVoiceGender(meQuery.data.ask_voice_gender);
    }
  }, [meQuery.data?.display_name, meQuery.data?.ask_voice_gender]);

  const selectAndUploadPhoto = async () => {
    const uri = await pickAvatarPhoto();
    if (!uri) return;
    setPhotoUri(uri);
    setPendingPhotoUri(uri);
    markDirty();
  };

  const save = async () => {
    if (!dirtyRef.current || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    const saveVersion = changeVersionRef.current;
    setSaveState('saving');
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
        applyAvatarToCache(savedUrl);
        if (userId) {
          void queryClient.invalidateQueries({
            queryKey: dogsQueryKey(userId),
            refetchType: 'none',
          });
        }
        setPendingPhotoUri(null);
        photoUploadedOnSave = true;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Errore sconosciuto';
        notify('Foto non salvata', detail);
        setSaveState('error');
        saveInFlightRef.current = false;
        return;
      } finally {
        setUploadingPhoto(false);
      }
    }
    if (pendingPhotoUri && !photoUploadedOnSave) {
      notify(
        'Foto non ancora salvata',
        'Tocca nuovamente la foto e completa il caricamento prima di uscire.',
      );
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }
    if (!name.trim()) {
      notify('Nome richiesto', 'Il nome del cane è obbligatorio.');
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }
    if (ageYears === null) {
      notify('Età richiesta', 'Seleziona l’età.');
      setSaveState('error');
      saveInFlightRef.current = false;
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
      notify('Peso non valido', 'Inserisci un peso valido in kg.');
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }

    try {
      const nextOwnerName = ownerName.trim() || null;
      const currentOwnerName = meQuery.data?.display_name ?? null;
      const currentVoice = meQuery.data?.ask_voice_gender ?? 'FEMALE';
      const mePatch: {
        display_name?: string | null;
        ask_voice_gender?: AskVoiceGender;
      } = {};
      if (userId && nextOwnerName !== currentOwnerName) {
        mePatch.display_name = nextOwnerName;
      }
      if (userId && voiceGender !== currentVoice) {
        mePatch.ask_voice_gender = voiceGender;
      }
      if (userId && Object.keys(mePatch).length > 0) {
        await updateMe.mutateAsync(mePatch);
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
        if (profileVisibility !== savedProfileVisibility) {
          try {
            const savedVisibility = await apiSetVisibility(
              dogId,
              profileVisibility === 'public' ? 'PUBLIC' : 'PRIVATE',
              profileVisibility === 'public' ? 'public-profile-v1' : undefined,
            );
            const confirmed = savedVisibility?.visibility
              ? savedVisibility.visibility === 'PUBLIC'
                ? 'public'
                : 'private'
              : profileVisibility;
            setProfileVisibility(confirmed);
            setSavedProfileVisibility(confirmed);
            if (savedVisibility) {
              queryClient.setQueryData(profileVisibilityQueryKey(dogId), savedVisibility);
            }
          } catch {
            notify(
              'Visibilità non aggiornata',
              'Il profilo è salvato, ma la visibilità non è stata aggiornata. Controlla la connessione e riprova.',
            );
            setSaveState('error');
            saveInFlightRef.current = false;
            return;
          }
        }
      }
      if (changeVersionRef.current === saveVersion) {
        dirtyRef.current = false;
        setSaveState('saved');
      } else {
        // A newer edit happened while the request was in flight. Keep it dirty
        // so the debounce effect immediately persists the newer snapshot.
        dirtyRef.current = true;
        setSaveState('idle');
      }
    } catch {
      notify(
        'Salvataggio non riuscito',
        'Controlla la connessione e riprova.',
      );
      setSaveState('error');
    } finally {
      saveInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => void save(), 650);
    return () => clearTimeout(timer);
  }, [ownerName, voiceGender, name, sex, ageYears, birthDate, sizeLabel, weightKg, breedSelection, profileVisibility, pendingPhotoUri]);

  const saveBusy = saveState === 'saving' || updateMutation.isPending || updateMe.isPending || uploadingPhoto;
  const saveLabel = saveBusy
    ? 'Salvataggio…'
    : saveState === 'error'
      ? 'Non salvato'
      : 'Salvato';
  const saveIcon = saveBusy
    ? 'cloud-upload-outline'
    : saveState === 'error'
      ? 'alert-circle-outline'
      : 'checkmark-circle-outline';

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Modifica profilo" />
      <View style={[styles.saveBar, saveState === 'error' && styles.saveBarError]} accessibilityLiveRegion="polite">
        <Ionicons name={saveIcon} size={17} color={saveState === 'error' ? colors.danger : colors.teal} />
        <Text style={styles.saveBarText}>{saveLabel}</Text>
        <Text style={styles.saveBarHint}>Le modifiche si salvano automaticamente</Text>
      </View>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      <View style={styles.profileHero}>
        <LinearGradient
          colors={[palette.heroFrom, palette.heroTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileHeroGradient}
        >
          <View style={styles.profileHeroCopy}>
            <Text style={styles.profileHeroEyebrow}>IL MONDO DI</Text>
            <Text style={styles.profileHeroTitle}>{name || dog.name || 'Il tuo cane'}</Text>
            <Text style={styles.profileHeroBody}>
              Ogni dettaglio rende DOGly più preciso e personale.
            </Text>
          </View>
          <View style={styles.profileHeroAvatar}>
            <DogAvatar photoUri={photoUri} dogName={name || dog.name} size={94} />
            <View style={styles.profileHeroSpark}>
              <Ionicons name="sparkles" size={14} color={colors.textOnPrimary} />
            </View>
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.sectionTitle}>Come ti chiama DOGly</Text>
      <Text style={styles.label}>Nome con cui DOGly ti chiama</Text>
      <TextInput
        value={ownerName}
        onChangeText={(value) => { setOwnerName(value); markDirty(); }}
        placeholder="Es. Attila"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        style={styles.input}
        testID="owner-display-name"
      />

      <Text style={styles.label}>Voce di DOGly (Live)</Text>
      <Text style={styles.voiceHint}>
        Si sente solo nella conversazione vocale. Puoi cambiarla quando vuoi.
      </Text>
      <View style={styles.chips}>
        {VOICE_OPTIONS.map((option) => (
          <SpringPress
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: voiceGender === option.value }}
            onPress={() => { setVoiceGender(option.value); markDirty(); }}
            pressableStyle={[
              styles.chip,
              styles.voiceChip,
              voiceGender === option.value && styles.chipActive,
            ]}
          >
            <Ionicons
              name={option.value === 'FEMALE' ? 'sparkles-outline' : 'planet-outline'}
              size={16}
              color={voiceGender === option.value ? '#FFFFFF' : colors.primary}
            />
            <View>
              <Text
                style={[
                  styles.chipText,
                  voiceGender === option.value && styles.chipTextActive,
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.voiceChipHint,
                  voiceGender === option.value && styles.voiceChipHintActive,
                ]}
              >
                {option.hint}
              </Text>
            </View>
          </SpringPress>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Il profilo di {name.trim() || dog.name}</Text>

      <SpringPress
        accessibilityRole="button"
        accessibilityLabel="Cambia foto profilo"
        disabled={uploadingPhoto}
        onPress={() => void selectAndUploadPhoto()}
        pressableStyle={styles.profilePhotoCard}
      >
        <View style={styles.avatarHalo}>
          <DogAvatar size={112} photoUri={photoUri} dogName={name || dog.name} />
        </View>
        <View style={styles.photoCopy}>
          <Text style={styles.photoTitle}>Foto di {name || dog.name}</Text>
          <Text style={styles.photoStatus}>
            {uploadingPhoto ? 'Salvataggio in corso…' : 'Tocca per cambiarla'}
          </Text>
        </View>
        <View style={styles.photoBadge}>
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </SpringPress>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        value={name}
        onChangeText={(value) => { setName(value); markDirty(); }}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Sesso</Text>
      <View style={styles.chips}>
        {SEX_OPTIONS.map((option) => (
          <SpringPress
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: sex === option.value }}
            onPress={() => { setSex(option.value); markDirty(); }}
            style={styles.sexCardWrap}
            pressableStyle={[styles.sexCard, sex === option.value && styles.sexCardSelected]}
          >
            <View style={[styles.sexAvatar, { backgroundColor: SEX_META[option.value].tint }]}>
              <Ionicons name={SEX_META[option.value].icon} size={22} color={SEX_META[option.value].iconColor} />
            </View>
            <Text style={[styles.sexLabel, sex === option.value && styles.sexLabelSelected]}>{option.label}</Text>
            <Text style={styles.sexHint}>{SEX_META[option.value].hint}</Text>
            {sex === option.value ? <View style={styles.sexCheck}><Ionicons name="checkmark" size={11} color="#FFFFFF" /></View> : null}
          </SpringPress>
        ))}
      </View>

      <Text style={styles.label}>Età</Text>
      <View style={styles.profileField}>
        <AgePicker
          value={ageYears}
          onChange={(years) => {
            setAgeYears(years);
            setBirthDate(null);
            markDirty();
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
            markDirty();
          }}
          testID="edit-birthday"
        />
      </View>

      <Text style={styles.label}>Taglia</Text>
      <View style={styles.chips}>
        {SIZES.map((size) => (
          <SpringPress
            key={size}
            onPress={() => { setSizeLabel(size); markDirty(); }}
            pressableStyle={[styles.chip, sizeLabel === size && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                sizeLabel === size && styles.chipTextActive,
              ]}
            >
              {size}
            </Text>
          </SpringPress>
        ))}
      </View>

      <Text style={styles.label}>Peso (kg, facoltativo)</Text>
      <TextInput
        value={weightKg}
        onChangeText={(value) => { setWeightKg(value); markDirty(); }}
        keyboardType="decimal-pad"
        placeholder="Es. 12,5"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Razza</Text>
      <View style={styles.breedField}>
        <BreedPicker
          value={breedSelection}
          onChange={(value) => { setBreedSelection(value); markDirty(); }}
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
          <SpringPress
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: profileVisibility === value }}
            onPress={() => {
              if (value === 'public') {
                confirmPublicProfile(() => { setProfileVisibility('public'); markDirty(); });
              } else {
                setProfileVisibility('private');
                markDirty();
              }
            }}
            pressableStyle={[
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
          </SpringPress>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  profileHero: {
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  profileHeroGradient: {
    minHeight: 168,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileHeroCopy: { flex: 1, gap: spacing.xs },
  profileHeroEyebrow: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.2,
  },
  profileHeroTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: typography.weight.bold,
  },
  profileHeroBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: 19,
    maxWidth: 220,
  },
  profileHeroAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.74)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeroSpark: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  feedback: { color: colors.danger, fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.lineHeight.relaxed },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: '#E8F8F4',
    marginBottom: spacing.md,
  },
  saveBarError: { backgroundColor: '#FFF0F0' },
  saveBarText: { color: colors.teal, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  saveBarHint: { color: colors.textMuted, fontSize: 11 },
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
  profilePhotoCard: {
    minHeight: 132,
    padding: spacing.md,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  photoCopy: { flex: 1, gap: 4 },
  photoTitle: { color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
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
  sexCardWrap: { flex: 1, minWidth: 88 },
  sexCard: {
    minHeight: 112,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#E8EEF5',
    position: 'relative',
  },
  sexCardSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.teal,
    borderWidth: 2,
  },
  sexAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  sexLabel: { color: colors.text, fontSize: 13, fontWeight: typography.weight.semibold },
  sexLabelSelected: { color: colors.teal },
  sexHint: { color: colors.textMuted, fontSize: 10, marginTop: 3, textAlign: 'center' },
  sexCheck: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityHint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  voiceHint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  voiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    flexGrow: 1,
    minWidth: '42%',
  },
  voiceChipHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  voiceChipHintActive: {
    color: 'rgba(255,255,255,0.85)',
  },
});

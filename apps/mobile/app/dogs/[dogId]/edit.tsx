/**
 * Modifica profilo cane — PATCH /v1/dogs/{id} via react-query.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { ApiError } from '@/lib/apiClient';
import { DogAvatar } from '@/features/core/components';
import {
  useDogProfile,
  useUpdateDogMutation,
} from '@/features/core/useDogProfile';
import { profileChangesToUpdateBody } from '@/features/dogs/profilePatch';
import { isLocalPhotoUri, persistDogAvatar } from '@/features/dogs/avatar';
import { useSession } from '@/features/auth/SessionProvider';
import { pickAvatarPhoto } from '@/features/photos/share';
import { BreedPicker } from '@/features/dogs/BreedPicker';
import { SpringPress } from '@/components/pressSpring';
import {
  breedLabelFromSelection,
  breedSelectionFromLabel,
} from '@/features/dogs/breeds';
import {
  BirthdayPicker,
} from '@/features/dogs/AgeBirthdayPicker';
import {
  ageFromBirthDate,
  ageLabelFromYears,
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
const SIZE_META: Record<(typeof SIZES)[number], { iconSize: number }> = {
  'Taglia piccola': { iconSize: 19 },
  'Taglia media': { iconSize: 23 },
  'Taglia grande': { iconSize: 27 },
};
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

const SEX_ILLUSTRATIONS: Record<'MALE' | 'FEMALE', number> = {
  MALE: require('../../../assets/images/dog-sex-male.png'),
  FEMALE: require('../../../assets/images/dog-sex-female.png'),
};

export default function DogEditScreen() {
  const params = useLocalSearchParams<{ dogId?: string | string[] }>();
  const router = useRouter();
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
  const [birthDate, setBirthDate] = useState(dog.birthDate);
  const ageYears = birthDate ? ageFromBirthDate(birthDate) : null;
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileVisibility, setProfileVisibility] = useState(
    dog.profileVisibility,
  );
  const [savedProfileVisibility, setSavedProfileVisibility] = useState(
    dog.profileVisibility,
  );
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const changeVersionRef = useRef(0);
  const hydratedDogIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const formRef = useRef({
    ownerName,
    voiceGender,
    name,
    sex,
    birthDate,
    sizeLabel,
    weightKg,
    breedSelection,
    photoUri,
    pendingPhotoUri,
    profileVisibility,
  });
  formRef.current = {
    ownerName,
    voiceGender,
    name,
    sex,
    birthDate,
    sizeLabel,
    weightKg,
    breedSelection,
    photoUri,
    pendingPhotoUri,
    profileVisibility,
  };
  const dogRef = useRef(dog);
  dogRef.current = dog;
  const meProfileRef = useRef(meQuery.data);
  meProfileRef.current = meQuery.data;
  const savedVisibilityRef = useRef(savedProfileVisibility);
  savedVisibilityRef.current = savedProfileVisibility;
  const markDirty = () => {
    changeVersionRef.current += 1;
    dirtyRef.current = true;
    setFeedback(null);
    setSaveState('idle');
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      setFeedback(`${title}: ${message}`);
      return;
    }
    Alert.alert(title, message);
  };
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

  // A deep link can mount before GET /v1/dogs has resolved. Hydrate the form
  // from the real dog once it arrives; otherwise the placeholder "Il tuo cane"
  // could be sent back by the autosave request.
  useEffect(() => {
    if (!dog.id || hydratedDogIdRef.current === dog.id || dirtyRef.current) return;
    hydratedDogIdRef.current = dog.id;
    setName(dog.name);
    setSex(dog.sex);
    setBirthDate(dog.birthDate);
    setSizeLabel(dog.sizeLabel);
    setWeightKg(dog.weightKg === null ? '' : String(dog.weightKg).replace('.', ','));
    setBreedSelection(breedSelectionFromLabel(dog.breedLabel));
    setProfileVisibility(dog.profileVisibility);
    setSavedProfileVisibility(dog.profileVisibility);
  }, [dog.id, dog.name, dog.sex, dog.birthDate, dog.sizeLabel, dog.weightKg, dog.breedLabel, dog.profileVisibility]);

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

  const scheduleSave = (delayMs = 650) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveRef.current?.();
    }, delayMs);
  };

  const save = async () => {
    if (!dirtyRef.current || saveInFlightRef.current) return;
    const form = formRef.current;
    const currentDog = dogRef.current;
    const currentMe = meProfileRef.current;
    const currentSavedVisibility = savedVisibilityRef.current;
    if (!currentDog.id || (routeDogId && currentDog.id !== routeDogId)) {
      notify('Profilo in caricamento', 'Attendi che i dati di Oreo siano pronti e riprova.');
      setSaveState('error');
      return;
    }
    saveInFlightRef.current = true;
    const saveVersion = changeVersionRef.current;
    setSaveState('saving');
    let photoUploadedOnSave = false;
    if (
      dogId &&
      form.photoUri &&
      isLocalPhotoUri(form.photoUri)
    ) {
      setUploadingPhoto(true);
      try {
        const savedUrl = await persistDogAvatar(dogId, form.photoUri);
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
        // Causa tecnica solo in console; al proprietario un messaggio calmo.
        console.error('[DogEdit] photo upload failed', error);
        notify(
          'Foto non salvata',
          'Non sono riuscito a caricarla. Controlla la connessione e riprova.',
        );
        setSaveState('error');
        saveInFlightRef.current = false;
        return;
      } finally {
        setUploadingPhoto(false);
      }
    }
    if (form.pendingPhotoUri && !photoUploadedOnSave) {
      notify(
        'Foto non ancora salvata',
        'Tocca nuovamente la foto e completa il caricamento prima di uscire.',
      );
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }
    if (!form.name.trim()) {
      notify('Nome richiesto', 'Il nome del cane è obbligatorio.');
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }
    if (!form.birthDate) {
      notify(
        'Data di nascita',
        'Scegli la data di nascita sul calendario: l’età si calcola da sola.',
      );
      setSaveState('error');
      saveInFlightRef.current = false;
      return;
    }
    const breedLabel = breedLabelFromSelection(form.breedSelection);
    const ageLabel = ageLabelFromYears(ageFromBirthDate(form.birthDate));
    const parsedWeight = form.weightKg.trim()
      ? Number(form.weightKg.trim().replace(',', '.'))
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
      const nextOwnerName = form.ownerName.trim() || null;
      const currentOwnerName = currentMe?.display_name ?? null;
      const currentVoice = currentMe?.ask_voice_gender ?? 'FEMALE';
      const mePatch: {
        display_name?: string | null;
        ask_voice_gender?: AskVoiceGender;
      } = {};
      if (userId && nextOwnerName !== currentOwnerName) {
        mePatch.display_name = nextOwnerName;
      }
      if (userId && form.voiceGender !== currentVoice) {
        mePatch.ask_voice_gender = form.voiceGender;
      }
      if (userId && Object.keys(mePatch).length > 0) {
        await updateMe.mutateAsync(mePatch);
      }
      if (dogId) {
        const profilePatch = profileChangesToUpdateBody(currentDog, {
          name: form.name.trim(),
          sex: form.sex,
          ageLabel,
          birthDate: form.birthDate,
          sizeLabel: form.sizeLabel,
          weightKg: parsedWeight,
          breedLabel,
          isMix: form.breedSelection.kind === 'mixed',
        });
        if (Object.keys(profilePatch).length > 0) {
          await updateMutation.mutateAsync(profilePatch);
        }
        if (form.profileVisibility !== currentSavedVisibility) {
          try {
            const savedVisibility = await apiSetVisibility(
              dogId,
              form.profileVisibility === 'public' ? 'PUBLIC' : 'PRIVATE',
              form.profileVisibility === 'public' ? 'public-profile-v1' : undefined,
            );
            const confirmed = savedVisibility?.visibility
              ? savedVisibility.visibility === 'PUBLIC'
                ? 'public'
                : 'private'
              : form.profileVisibility;
            setProfileVisibility(confirmed);
            setSavedProfileVisibility(confirmed);
            savedVisibilityRef.current = confirmed;
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
    } catch (error) {
      // Keep the technical cause in the console for diagnosis while showing
      // a calm, actionable message to the owner.
      console.error('[DogEdit] save failed', error);
      const message = error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? 'La sessione è scaduta. Accedi di nuovo per salvare.'
        : error instanceof Error && /network|timeout|raggiungere/i.test(error.message)
          ? 'Controlla la connessione e riprova.'
          : 'Il profilo non è stato aggiornato. Riprova tra poco.';
      notify('Salvataggio non riuscito', message);
      setSaveState('error');
    } finally {
      saveInFlightRef.current = false;
      if (dirtyRef.current && changeVersionRef.current !== saveVersion) {
        scheduleSave();
      }
    }
  };

  saveRef.current = save;

  const handleBack = async () => {
    if (saveInFlightRef.current) {
      notify('Salvataggio in corso', 'Attendi qualche secondo prima di uscire.');
      return;
    }
    if (dirtyRef.current) {
      await saveRef.current?.();
      if (dirtyRef.current) return;
    }
    router.back();
  };

  useEffect(() => {
    if (!dirtyRef.current) return;
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [ownerName, voiceGender, name, sex, birthDate, sizeLabel, weightKg, breedSelection, profileVisibility, pendingPhotoUri]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

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
  const profileFields = [
    name.trim(),
    birthDate,
    sex && sex !== 'UNKNOWN' ? sex : '',
    sizeLabel,
    breedSelection.kind !== 'unknown' ? breedLabelFromSelection(breedSelection) : '',
  ];
  const profileComplete = profileFields.filter(Boolean).length;
  const profileProgress = profileComplete / profileFields.length;

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <View style={styles.referenceHeader}>
        <SpringPress
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => void handleBack()}
          pressableStyle={styles.backButton}
        >
          <Ionicons name="chevron-back" size={31} color={colors.text} />
        </SpringPress>
        <Text style={styles.headerTitle}>Modifica profilo</Text>
        <View style={styles.headerBalance} />
      </View>
      <SpringPress
        accessibilityRole={saveState === 'error' ? 'button' : 'text'}
        accessibilityLabel={saveState === 'error' ? 'Riprova salvataggio' : saveBusy ? saveLabel : 'Salvato automaticamente'}
        disabled={saveState !== 'error' || saveBusy}
        onPress={() => void saveRef.current?.()}
        style={styles.saveBarPress}
        pressableStyle={[styles.saveBar, saveState === 'error' && styles.saveBarError]}
        accessibilityLiveRegion="polite"
      >
        <Ionicons name={saveIcon} size={20} color={saveState === 'error' ? colors.danger : colors.teal} />
        <Text style={[styles.saveBarText, saveState === 'error' && styles.saveBarTextError]}>{saveState === 'error' ? `${saveLabel} · Tocca per riprovare` : saveBusy ? saveLabel : 'Salvato automaticamente'}</Text>
      </SpringPress>
      <View style={styles.completeness} accessibilityLabel={`Profilo completo al ${Math.round(profileProgress * 100)} per cento`}>
        <View style={styles.completenessHeader}>
          <Text style={styles.completenessTitle}>Profilo {profileComplete === profileFields.length ? 'completo' : 'in corso'}</Text>
          <Text style={styles.completenessValue}>{profileComplete}/{profileFields.length}</Text>
        </View>
        <View style={styles.completenessTrack}><View style={[styles.completenessFill, { width: `${profileProgress * 100}%` }]} /></View>
      </View>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      <View style={styles.identityRow}>
        <SpringPress
          accessibilityRole="button"
          accessibilityLabel="Cambia foto profilo"
          disabled={uploadingPhoto}
          onPress={() => void selectAndUploadPhoto()}
          pressableStyle={styles.identityPhotoPress}
        >
          <View style={styles.identityPhotoHalo}>
            <DogAvatar size={130} photoUri={photoUri} dogName={name || dog.name} />
          </View>
          <View style={styles.photoBadgeLarge}>
            <Ionicons name="camera" size={22} color="#FFFFFF" />
          </View>
        </SpringPress>
        <View style={styles.identityDetails}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={(value) => { setName(value); markDirty(); }}
            style={[styles.input, styles.identityInput]}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Nome del cane"
          />
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.sectionHeading}>Sesso</Text>
      <View style={styles.sexGrid}>
        {SEX_OPTIONS.filter((option) => option.value !== 'UNKNOWN').map((option) => (
          <SpringPress
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: sex === option.value }}
            onPress={() => { setSex(option.value); markDirty(); }}
            style={styles.sexCardWrap}
            pressableStyle={[styles.sexCard, sex === option.value && styles.sexCardSelected]}
          >
            <Image source={SEX_ILLUSTRATIONS[option.value as 'MALE' | 'FEMALE']} style={styles.sexIllustration} resizeMode="contain" accessibilityLabel={`${option.label}, illustrazione`} />
            <Text style={[styles.sexLabel, sex === option.value && styles.sexLabelSelected]}>{option.label}</Text>
            <View style={[styles.radio, sex === option.value && styles.radioSelected]}>
              {sex === option.value ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : null}
            </View>
          </SpringPress>
        ))}
      </View>
      <SpringPress
        accessibilityRole="button"
        accessibilityState={{ selected: sex === 'UNKNOWN' }}
        onPress={() => { setSex('UNKNOWN'); markDirty(); }}
        pressableStyle={[styles.unknownCard, sex === 'UNKNOWN' && styles.unknownCardSelected]}
      >
        <View style={[styles.unknownIcon, sex === 'UNKNOWN' && styles.unknownIconSelected]}>
          <Text style={[styles.unknownQuestion, sex === 'UNKNOWN' && styles.unknownQuestionSelected]}>?</Text>
        </View>
        <Text style={[styles.unknownLabel, sex === 'UNKNOWN' && styles.unknownLabelSelected]}>Non so</Text>
        <View style={[styles.radio, sex === 'UNKNOWN' && styles.radioSelected]}>
          {sex === 'UNKNOWN' ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : null}
        </View>
      </SpringPress>

      <Text style={styles.sectionHeading}>Data di nascita</Text>
      <View style={styles.profileField}>
        <BirthdayPicker
          value={birthDate}
          ageYears={ageYears}
          onChange={(date) => { setBirthDate(date); markDirty(); }}
          testID="edit-birthday"
        />
      </View>

      <Text style={styles.sectionHeading}>Taglia</Text>
      <View style={styles.sizeGrid}>
        {SIZES.map((size) => (
          <SpringPress
            key={size}
            onPress={() => { setSizeLabel(size); markDirty(); }}
            pressableStyle={[styles.sizeCard, sizeLabel === size && styles.sizeCardActive]}
          >
            <MaterialCommunityIcons name="dog-side" size={SIZE_META[size].iconSize} color={sizeLabel === size ? '#FFFFFF' : colors.primary} />
            <Text style={[styles.sizeText, sizeLabel === size && styles.sizeTextActive]}>{size}</Text>
            {sizeLabel === size ? <Ionicons name="checkmark-circle" size={23} color="#FFFFFF" /> : null}
          </SpringPress>
        ))}
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Peso (kg, facoltativo)</Text>
          <View style={styles.suffixField}>
            <TextInput
              value={weightKg}
              onChangeText={(value) => { setWeightKg(value); markDirty(); }}
              keyboardType="decimal-pad"
              placeholder="12"
              placeholderTextColor={colors.textMuted}
              style={styles.suffixInput}
              accessibilityLabel="Peso in chilogrammi"
            />
            <Text style={styles.suffix}>kg</Text>
          </View>
        </View>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Razza</Text>
          <View style={styles.breedField}>
            <BreedPicker
              value={breedSelection}
              onChange={(value) => { setBreedSelection(value); markDirty(); }}
              testID="edit-breed"
            />
          </View>
        </View>
      </View>

      <View style={styles.divider} />
      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionIcon}><Ionicons name="chatbubble-ellipses" size={19} color="#FFFFFF" /></View>
        <Text style={styles.sectionHeadingLarge}>Le tue preferenze</Text>
      </View>
      <Text style={styles.label}>Come ti chiama DOGly</Text>
      <TextInput
        value={ownerName}
        onChangeText={(value) => { setOwnerName(value); markDirty(); }}
        placeholder="Es. Attila"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        style={styles.input}
        testID="owner-display-name"
      />
      <Text style={styles.sectionLabel}>Voce di DOGly · Live</Text>
      <View style={styles.voiceGrid}>
        {VOICE_OPTIONS.map((option) => (
          <SpringPress
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: voiceGender === option.value }}
            onPress={() => { setVoiceGender(option.value); markDirty(); }}
            pressableStyle={[styles.voiceCard, voiceGender === option.value && styles.voiceCardSelected, option.value === 'FEMALE' && styles.voiceCardFemale]}
          >
            <Ionicons name="pulse-outline" size={34} color={voiceGender === option.value ? colors.teal : colors.coral} />
            <View style={styles.voiceCopy}>
              <Text style={[styles.voiceLabel, voiceGender === option.value && styles.voiceLabelSelected]}>{option.label}</Text>
              <Text style={styles.voiceHintSmall}>{option.hint}</Text>
            </View>
            <View style={[styles.radio, voiceGender === option.value && styles.radioSelected]}>
              {voiceGender === option.value ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : null}
            </View>
          </SpringPress>
        ))}
      </View>
      <Text style={styles.voiceHint}>Solo per la conversazione vocale. Puoi cambiarla quando vuoi.</Text>

      <View style={styles.divider} />
      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionIcon}><Ionicons name="lock-closed" size={18} color="#FFFFFF" /></View>
        <Text style={styles.sectionHeadingLarge}>Visibilità del profilo</Text>
      </View>
      <View style={styles.visibilityGrid}>
        {(
          [
            ['private', 'Privato', 'lock-closed'],
            ['public', 'Pubblico', 'globe-outline'],
          ] as const
        ).map(([value, label, icon]) => (
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
            pressableStyle={[styles.visibilityCard, profileVisibility === value && styles.visibilityCardSelected]}
          >
            <Ionicons name={icon} size={27} color={profileVisibility === value ? '#FFFFFF' : colors.primary} />
            <Text style={[styles.visibilityLabel, profileVisibility === value && styles.visibilityLabelSelected]}>{label}</Text>
            {profileVisibility === value ? <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" /> : null}
          </SpringPress>
        ))}
      </View>
      <Text style={styles.visibilityCardHint}>
        Il profilo è privato di default. Per renderlo pubblico serve il tuo consenso, revocabile in qualsiasi momento.
      </Text>
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
    paddingTop: 8,
    paddingBottom: spacing.xxxl,
    backgroundColor: '#FFFEFC',
  },
  referenceHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 46,
    height: 46,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerBalance: { width: 46, height: 46 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 25,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.7,
  },
  feedback: { color: colors.danger, fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.lineHeight.relaxed, marginBottom: spacing.md },
  completeness: { marginBottom: spacing.lg, padding: spacing.md, borderRadius: 16, backgroundColor: '#F0FAF8', borderWidth: 1, borderColor: '#D6F0EA' },
  completenessHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  completenessTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  completenessValue: { color: colors.teal, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  completenessTrack: { height: 7, borderRadius: 99, overflow: 'hidden', backgroundColor: '#DDEEEA' },
  completenessFill: { height: '100%', borderRadius: 99, backgroundColor: colors.teal },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    paddingVertical: 4,
    marginBottom: spacing.xl,
  },
  saveBarPress: { alignSelf: 'center' },
  saveBarError: { paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: '#FFF0F0' },
  saveBarText: { color: colors.teal, fontSize: 18, fontWeight: typography.weight.medium },
  saveBarTextError: { color: colors.danger },
  saveBarHint: { display: 'none' },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xl,
  },
  identityPhotoPress: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center' },
  identityPhotoHalo: {
    width: 140,
    height: 140,
    borderRadius: 70,
    padding: 5,
    backgroundColor: '#FFFFFF',
    ...shadows.raised,
  },
  photoBadgeLarge: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.teal,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  identityDetails: { flex: 1, minWidth: 0 },
  identityInput: { fontSize: 22, minHeight: 68, marginBottom: 0 },
  divider: { height: 1, backgroundColor: '#D9E3EF', marginVertical: spacing.lg },
  sectionHeading: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
  },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  sectionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  sectionHeadingLarge: { color: colors.text, fontSize: 24, fontWeight: typography.weight.bold, letterSpacing: -0.5 },
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
    fontSize: 17,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5E5FB',
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    fontSize: 19,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    minHeight: 64,
  },
  breedField: {
    marginBottom: spacing.lg,
  },
  profileField: {
    marginBottom: spacing.md,
  },
  ageHint: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    lineHeight: 17,
    marginTop: -spacing.md,
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
  sexGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  sexCardWrap: { flex: 1, minWidth: 0 },
  sexCard: {
    minHeight: 190,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#FFF7F8',
    borderWidth: 1.5,
    borderColor: '#FFD7DE',
    position: 'relative',
  },
  sexCardSelected: {
    backgroundColor: '#F0FFFB',
    borderColor: colors.teal,
    borderWidth: 2,
  },
  sexIllustration: {
    width: '92%',
    height: 116,
    marginBottom: 3,
  },
  sexLabel: { color: colors.text, fontSize: 17, fontWeight: typography.weight.bold, marginBottom: 4 },
  sexLabelSelected: { color: colors.text },
  radio: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#D8E4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  unknownCard: {
    minHeight: 70,
    borderRadius: 17,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: '#D8E4F1',
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.lg,
  },
  unknownCardSelected: { borderColor: colors.teal, backgroundColor: '#F0FFFB' },
  unknownIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: '#7C91B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownIconSelected: { borderColor: colors.teal },
  unknownQuestion: { color: '#7C91B3', fontSize: 26, fontWeight: typography.weight.bold },
  unknownQuestionSelected: { color: colors.teal },
  unknownLabel: { flex: 1, color: '#61789C', fontSize: 20, fontWeight: typography.weight.semibold },
  unknownLabelSelected: { color: colors.text },
  sizeGrid: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  sizeCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 65,
    borderRadius: 16,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderColor: '#D8E4F1',
    backgroundColor: '#FFFFFF',
  },
  sizeCardActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  sizeText: { flexShrink: 1, color: '#61789C', fontSize: 12, lineHeight: 15, fontWeight: typography.weight.semibold, textAlign: 'center' },
  sizeTextActive: { color: '#FFFFFF' },
  fieldRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  fieldHalf: { flex: 1, minWidth: 0 },
  suffixField: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: '#D5E5FB',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  suffixInput: { flex: 1, color: colors.text, fontSize: 20, paddingVertical: 0 },
  suffix: { color: '#7187AA', fontSize: 18 },
  voiceGrid: { flexDirection: 'row', gap: 8 },
  voiceCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#BEEBE2',
    backgroundColor: '#F0FFFB',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  voiceCardFemale: { borderColor: '#FFD4DD', backgroundColor: '#FFF7F8' },
  voiceCardSelected: { borderColor: colors.teal, borderWidth: 2 },
  voiceCopy: { flex: 1, minWidth: 0 },
  voiceLabel: { color: colors.text, fontSize: 14, fontWeight: typography.weight.bold },
  voiceLabelSelected: { color: colors.text },
  voiceHintSmall: { color: '#6F86AA', fontSize: 11, lineHeight: 14, marginTop: 3 },
  visibilityGrid: { flexDirection: 'row', gap: 8 },
  visibilityCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#D8E4F1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  visibilityCardSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  visibilityLabel: { flexShrink: 1, color: '#61789C', fontSize: 14, fontWeight: typography.weight.bold },
  visibilityLabelSelected: { color: '#FFFFFF' },
  visibilityCardHint: {
    color: '#6980A5',
    backgroundColor: '#ECFBF5',
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
  },
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

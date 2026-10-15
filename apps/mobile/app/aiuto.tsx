/**
 * Aiuto rapido: veterinario salvato, ricerca vicina, pronto soccorso, chiamate.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { CuteIcon } from '@/components/CuteIcon';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  clearSavedVet,
  isCallablePhone,
  loadSavedVet,
  saveSavedVet,
  type SavedVetContact,
} from '@/features/care/contactsStore';
import {
  fetchNearbyPlaces,
  formatDistance,
  locationFailureCopy,
  readDeviceLocationFast,
  type LocationFailureReason,
  type NearbyPlace,
} from '@/features/places/api';

const doctorHero = require('../assets/brand/care-dog-doctor-icon.jpg');

type SearchMode = 'vet' | 'emergency';

export default function AiutoScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationFailure, setLocationFailure] =
    useState<LocationFailureReason | null>(null);
  const [locationTick, setLocationTick] = useState(0);
  const [mode, setMode] = useState<SearchMode>('vet');
  const [savedVet, setSavedVet] = useState<SavedVetContact | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSavedVet(dog.id).then((contact) => {
      if (alive) setSavedVet(contact);
    });
    return () => {
      alive = false;
    };
  }, [dog.id]);

  useEffect(() => {
    let alive = true;
    setLocating(true);
    setLocationFailure(null);
    void readDeviceLocationFast().then((result) => {
      if (!alive) return;
      setLocating(false);
      if (!result.ok) {
        setCoords(null);
        setLocationFailure(result.reason);
        return;
      }
      setLocationFailure(null);
      setCoords({ lat: result.lat, lng: result.lng });
    });
    return () => {
      alive = false;
    };
  }, [locationTick]);

  const placesQuery = useQuery({
    queryKey: ['care-places', coords?.lat, coords?.lng, mode],
    queryFn: () =>
      fetchNearbyPlaces({
        lat: coords!.lat,
        lng: coords!.lng,
        kind: 'VET',
        radius_m: mode === 'emergency' ? 20_000 : 12_000,
        purpose: mode === 'emergency' ? 'emergency' : 'default',
      }),
    enabled: Boolean(coords),
    retry: 1,
  });

  const places = useMemo(
    () => (placesQuery.data?.items ?? []).filter((p) => p.kind === 'VET'),
    [placesQuery.data],
  );

  const openEditor = (seed?: SavedVetContact | null) => {
    setDraftName(seed?.name ?? '');
    setDraftPhone(seed?.phone ?? '');
    setSaveError(null);
    setEditorOpen(true);
  };

  const onSave = async () => {
    try {
      const saved = await saveSavedVet(dog.id, {
        name: draftName,
        phone: draftPhone,
      });
      setSavedVet(saved);
      setEditorOpen(false);
    } catch {
      setSaveError('Inserisci nome e un numero chiamabile.');
    }
  };

  const callPhone = (phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  };

  const openMapsQuery = (query: string) => {
    const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (coords) {
      void Linking.openURL(`${base}&center=${coords.lat},${coords.lng}`);
      return;
    }
    void Linking.openURL(base);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Torna indietro"
              onPress={() => router.back()}
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>AIUTO RAPIDO</Text>
              <Text style={styles.title}>Numeri utili per {dog.name}</Text>
            </View>
            <Image source={doctorHero} style={styles.heroIcon} />
          </View>

          <View style={styles.savedCard}>
            <View style={styles.savedTop}>
              <View style={styles.savedIcon}>
                <CuteIcon name="doctor" size={28} color="#0D9488" secondary="#0E2A47" />
              </View>
              <View style={styles.savedCopy}>
                <Text style={styles.savedLabel}>Il tuo veterinario</Text>
                {savedVet ? (
                  <>
                    <Text style={styles.savedName}>{savedVet.name}</Text>
                    <Text style={styles.savedPhone}>{savedVet.phone}</Text>
                  </>
                ) : (
                  <Text style={styles.savedEmpty}>
                    Salva clinica e numero: un tap e chiami.
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.savedActions}>
              {savedVet ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Chiama ${savedVet.name}`}
                  onPress={() => callPhone(savedVet.phone)}
                  style={styles.callPrimary}
                >
                  <Ionicons name="call" size={16} color="#FFFFFF" />
                  <Text style={styles.callPrimaryText}>Chiama ora</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openEditor(savedVet)}
                style={[styles.secondaryBtn, savedVet ? styles.secondaryBtnFlex : null]}
              >
                <Text style={styles.secondaryBtnText}>
                  {savedVet ? 'Modifica' : 'Aggiungi veterinario'}
                </Text>
              </Pressable>
              {savedVet ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void clearSavedVet(dog.id).then(() => setSavedVet(null));
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clearLink}>Rimuovi</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.modeRow}>
            <ModePill
              label="Veterinari vicino"
              active={mode === 'vet'}
              onPress={() => setMode('vet')}
            />
            <ModePill
              label="Pronto soccorso"
              active={mode === 'emergency'}
              danger
              onPress={() => setMode('emergency')}
            />
          </View>

          {mode === 'emergency' ? (
            <View style={styles.emergencyBanner}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
              <Text style={styles.emergencyText}>
                Difficoltà a respirare, collasso o dolore intenso: cerca una struttura
                24h e chiama subito.
              </Text>
            </View>
          ) : null}

          {locating ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Localizzo in fretta…</Text>
            </View>
          ) : locationFailure || !coords ? (
            <View style={styles.fallback}>
              <Text style={styles.muted}>
                {locationFailure
                  ? locationFailureCopy(locationFailure)
                  : 'Serve la posizione per i numeri vicini.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLocationTick((v) => v + 1)}
                style={styles.callPrimary}
              >
                <Text style={styles.callPrimaryText}>Attiva / riprova GPS</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  openMapsQuery(
                    mode === 'emergency'
                      ? 'pronto soccorso veterinario'
                      : 'veterinario vicino a me',
                  )
                }
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Apri mappa senza GPS</Text>
              </Pressable>
            </View>
          ) : placesQuery.isFetching ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>
                {mode === 'emergency'
                  ? 'Cerco pronto soccorso e cliniche 24h…'
                  : 'Cerco veterinari vicino a voi…'}
              </Text>
            </View>
          ) : placesQuery.isError ? (
            <View style={styles.fallback}>
              <Text style={styles.muted}>
                Non riesco a caricare le cliniche. Riprova o apri la mappa.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void placesQuery.refetch()}
                style={styles.callPrimary}
              >
                <Text style={styles.callPrimaryText}>Riprova</Text>
              </Pressable>
            </View>
          ) : places.length === 0 ? (
            <View style={styles.fallback}>
              <Text style={styles.muted}>
                Nessuna clinica trovata qui intorno, per ora.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  openMapsQuery(
                    mode === 'emergency'
                      ? 'pronto soccorso veterinario'
                      : 'clinica veterinaria',
                  )
                }
                style={styles.callPrimary}
              >
                <Text style={styles.callPrimaryText}>Apri mappa</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {places.map((place) => (
                <PlaceCallCard key={place.id} place={place} onCall={callPhone} />
              ))}
            </View>
          )}

          <Text style={styles.note}>
            DOGly non sostituisce una visita. In dubbio, chiama e descrivi cosa sta
            succedendo a {dog.name}.
          </Text>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={editorOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Il tuo veterinario</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Nome clinica"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="words"
            />
            <TextInput
              value={draftPhone}
              onChangeText={setDraftPhone}
              placeholder="Telefono"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditorOpen(false)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Annulla</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void onSave()}
                style={[
                  styles.callPrimary,
                  !draftName.trim() || !isCallablePhone(draftPhone)
                    ? styles.callDisabled
                    : null,
                ]}
              >
                <Text style={styles.callPrimaryText}>Salva</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ModePill({
  label,
  active,
  onPress,
  danger,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.modePill,
        active && (danger ? styles.modePillDanger : styles.modePillActive),
      ]}
    >
      <Text
        style={[
          styles.modeLabel,
          active && styles.modeLabelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PlaceCallCard({
  place,
  onCall,
}: {
  place: NearbyPlace;
  onCall: (phone: string) => void;
}) {
  return (
    <View style={styles.placeCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apri ${place.name} sulla mappa`}
        onPress={() => void Linking.openURL(place.maps_url)}
        style={styles.placeMain}
      >
        <View style={styles.placeIcon}>
          <CuteIcon name="heart" size={22} color="#B45309" secondary="#FEF3C7" />
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.placeTitle} numberOfLines={2}>
            {place.name}
          </Text>
          <Text style={styles.placeMeta}>{formatDistance(place.distance_m)}</Text>
        </View>
        <Ionicons name="map-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {place.phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chiama ${place.name}`}
          onPress={() => onCall(place.phone!)}
          style={styles.callPrimary}
        >
          <Ionicons name="call" size={15} color="#FFFFFF" />
          <Text style={styles.callPrimaryText}>Chiama</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(place.maps_url)}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Apri per il numero</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.9,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    lineHeight: 28,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
  },
  savedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  savedIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCopy: { flex: 1, gap: 2 },
  savedLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  savedName: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  savedPhone: { color: colors.textSecondary, fontSize: typography.size.sm },
  savedEmpty: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  savedActions: { gap: spacing.sm },
  callPrimary: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#0D9488',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  callPrimaryText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  callDisabled: { opacity: 0.45 },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryBtnFlex: { alignSelf: 'stretch' },
  secondaryBtnText: {
    color: colors.primary,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  clearLink: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modePill: {
    flex: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  modePillActive: { backgroundColor: colors.accent },
  modePillDanger: { backgroundColor: colors.danger },
  modeLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  modeLabelActive: { color: '#FFFFFF', fontWeight: typography.weight.bold },
  emergencyBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emergencyText: {
    flex: 1,
    color: '#7F1D1D',
    fontSize: typography.size.sm,
    lineHeight: 20,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  fallback: { gap: spacing.sm },
  list: { gap: spacing.sm },
  placeCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  placeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCopy: { flex: 1, gap: 2 },
  placeTitle: {
    color: colors.text,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  placeMeta: { color: colors.textSecondary, fontSize: 12 },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,42,71,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    fontSize: typography.size.md,
  },
  saveError: { color: colors.danger, fontSize: typography.size.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});

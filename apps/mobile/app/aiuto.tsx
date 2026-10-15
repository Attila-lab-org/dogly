/**
 * Aiuto rapido: veterinario salvato, ricerca vicina, pronto soccorso, chiamate.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

type SearchMode = 'vet' | 'emergency';

function displayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

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
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
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
          </View>

          {savedVet ? (
            <View style={styles.heroCall}>
              <View style={styles.heroTop}>
                <View style={styles.heroBadge}>
                  <Ionicons name="medkit" size={22} color="#0F766E" />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroLabel}>Il tuo veterinario</Text>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {displayName(savedVet.name)}
                  </Text>
                  <Text style={styles.heroPhone}>{savedVet.phone}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Opzioni veterinario"
                  onPress={() => setMenuOpen(true)}
                  hitSlop={10}
                  style={styles.moreBtn}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Chiama ${savedVet.name}`}
                onPress={() => callPhone(savedVet.phone)}
                style={styles.callFab}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.callFabText}>Chiama</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => openEditor(null)}
              style={({ pressed }) => [styles.addVet, pressed && styles.pressed]}
            >
              <View style={styles.heroBadge}>
                <Ionicons name="add" size={22} color="#0F766E" />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroName}>Aggiungi il tuo veterinario</Text>
                <Text style={styles.heroPhone}>
                  Nome e numero: sempre a un tocco di distanza.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}

          <View style={styles.segment}>
            <SegmentBtn
              label="Vicino a te"
              active={mode === 'vet'}
              onPress={() => setMode('vet')}
            />
            <SegmentBtn
              label="Pronto soccorso"
              active={mode === 'emergency'}
              danger
              onPress={() => setMode('emergency')}
            />
          </View>

          {mode === 'emergency' ? (
            <Text style={styles.emergencyHint}>
              Strutture 24h e pronto soccorso veterinario vicino a voi.
            </Text>
          ) : null}

          {locating ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Localizzo…</Text>
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
                style={styles.callFab}
              >
                <Text style={styles.callFabText}>Attiva posizione</Text>
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
              >
                <Text style={styles.textLink}>Apri mappa senza GPS</Text>
              </Pressable>
            </View>
          ) : placesQuery.isFetching ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>
                {mode === 'emergency' ? 'Cerco pronto soccorso…' : 'Cerco veterinari…'}
              </Text>
            </View>
          ) : placesQuery.isError ? (
            <View style={styles.fallback}>
              <Text style={styles.muted}>Non riesco a caricare le cliniche.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void placesQuery.refetch()}
                style={styles.callFab}
              >
                <Text style={styles.callFabText}>Riprova</Text>
              </Pressable>
            </View>
          ) : places.length === 0 ? (
            <View style={styles.fallback}>
              <Text style={styles.muted}>Nessuna clinica qui intorno, per ora.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  openMapsQuery(
                    mode === 'emergency'
                      ? 'pronto soccorso veterinario'
                      : 'clinica veterinaria',
                  )
                }
                style={styles.callFab}
              >
                <Text style={styles.callFabText}>Apri mappa</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {places.map((place) => (
                <PlaceRow key={place.id} place={place} onCall={callPhone} />
              ))}
            </View>
          )}

          <Text style={styles.note}>
            In dubbio, chiama e descrivi cosa sta succedendo a {dog.name}. DOGly non
            sostituisce una visita.
          </Text>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={menuOpen} animationType="fade" transparent>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <Pressable
              accessibilityRole="button"
              onPress={() => openEditor(savedVet)}
              style={styles.menuItem}
            >
              <Ionicons name="create-outline" size={20} color={colors.text} />
              <Text style={styles.menuItemText}>Modifica</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                void clearSavedVet(dog.id).then(() => setSavedVet(null));
              }}
              style={styles.menuItem}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.menuItemText, styles.menuDanger]}>Rimuovi</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenuOpen(false)}
              style={[styles.menuItem, styles.menuCancel]}
            >
              <Text style={styles.menuCancelText}>Annulla</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={editorOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Il tuo veterinario</Text>
            <Text style={styles.modalHint}>Nome della clinica o del dottore, e il numero.</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Es. Clinica San Barnaba"
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
                style={styles.modalGhost}
              >
                <Text style={styles.modalGhostText}>Annulla</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void onSave()}
                style={[
                  styles.callFab,
                  styles.modalSave,
                  !draftName.trim() || !isCallablePhone(draftPhone)
                    ? styles.callDisabled
                    : null,
                ]}
              >
                <Text style={styles.callFabText}>Salva</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SegmentBtn({
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
        styles.segmentBtn,
        active && (danger ? styles.segmentDanger : styles.segmentActive),
      ]}
    >
      <Text
        style={[
          styles.segmentLabel,
          active && styles.segmentLabelActive,
          active && danger && styles.segmentLabelOnDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PlaceRow({
  place,
  onCall,
}: {
  place: NearbyPlace;
  onCall: (phone: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apri ${place.name} sulla mappa`}
        onPress={() => void Linking.openURL(place.maps_url)}
        style={styles.rowMain}
      >
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.rowMeta}>{formatDistance(place.distance_m)}</Text>
        </View>
      </Pressable>
      {place.phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chiama ${place.name}`}
          onPress={() => onCall(place.phone!)}
          style={styles.rowCall}
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri mappa per ${place.name}`}
          onPress={() => void Linking.openURL(place.maps_url)}
          style={styles.rowMap}
        >
          <Ionicons name="map-outline" size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const TEAL = '#0F766E';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: {
    color: TEAL,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    lineHeight: 28,
  },
  heroCall: {
    backgroundColor: '#ECFDF8',
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, gap: 2 },
  heroLabel: {
    color: TEAL,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroName: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  heroPhone: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: 20,
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  addVet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  pressed: { opacity: 0.85 },
  callFab: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: TEAL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  callFabText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  callDisabled: { opacity: 0.4 },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentDanger: { backgroundColor: colors.danger },
  segmentLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  segmentLabelActive: {
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  segmentLabelOnDanger: { color: '#FFFFFF' },
  emergencyHint: {
    color: '#7F1D1D',
    fontSize: typography.size.sm,
    lineHeight: 20,
    marginTop: -spacing.sm,
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
  fallback: { gap: spacing.md, alignItems: 'stretch' },
  textLink: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  list: {
    gap: 0,
    backgroundColor: colors.surface,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowCopy: { gap: 2 },
  rowTitle: {
    color: colors.text,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  rowMeta: { color: colors.textSecondary, fontSize: 12 },
  rowCall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,42,71,0.4)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  menuDanger: { color: colors.danger },
  menuCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
    backgroundColor: colors.surfaceMuted,
  },
  menuCancelText: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    width: '100%',
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
  },
  modalHint: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
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
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  modalGhost: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostText: {
    color: colors.textSecondary,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  modalSave: { flex: 1.2 },
});

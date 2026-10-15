/**
 * Sezione luoghi utili sotto le storie Social — fallback mappa sempre presente.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { CuteIcon } from '@/components/CuteIcon';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  fetchNearbyPlaces,
  formatDistance,
  locationFailureCopy,
  readDeviceLocationResult,
  type LocationFailureReason,
  type NearbyPlace,
} from '@/features/places/api';

type PlaceFilter = 'ALL' | 'PARK' | 'VET';

const PLACE_FILTERS: { key: PlaceFilter; label: string }[] = [
  { key: 'ALL', label: 'Tutti' },
  { key: 'PARK', label: 'Parchi' },
  { key: 'VET', label: 'Veterinari' },
];

function mapsSearchUrl(query: string, coords?: { lat: number; lng: number } | null) {
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&center=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function NearbyPlacesSection() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationFailure, setLocationFailure] =
    useState<LocationFailureReason | null>(null);
  const [locationTick, setLocationTick] = useState(0);
  const [placesTimedOut, setPlacesTimedOut] = useState(false);
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter>('ALL');

  useEffect(() => {
    let alive = true;
    setLocating(true);
    setLocationFailure(null);
    setCoords(null);
    setPlacesTimedOut(false);
    void readDeviceLocationResult().then((result) => {
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
    queryKey: ['nearby-places', coords?.lat, coords?.lng],
    queryFn: () => fetchNearbyPlaces({ lat: coords!.lat, lng: coords!.lng }),
    enabled: Boolean(coords),
    retry: 0,
  });

  useEffect(() => {
    if (!coords || !placesQuery.isFetching) {
      setPlacesTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setPlacesTimedOut(true), 8_000);
    return () => clearTimeout(timer);
  }, [coords, placesQuery.isFetching]);

  const places = useMemo(
    () => placesQuery.data?.items ?? [],
    [placesQuery.data],
  );
  const filteredPlaces = useMemo(
    () =>
      placeFilter === 'ALL'
        ? places
        : places.filter((place) => place.kind === placeFilter),
    [places, placeFilter],
  );

  const openMaps = (query: string) => {
    void Linking.openURL(mapsSearchUrl(query, coords));
  };

  return (
    <View style={styles.root}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Luoghi utili</Text>
        <Ionicons name="location-outline" size={20} color={colors.accent} />
      </View>

      <View style={styles.filterRow}>
        {PLACE_FILTERS.map((filter) => {
          const active = placeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPlaceFilter(filter.key)}
              style={[styles.filterPill, active && styles.filterPillActive]}
            >
              <Text
                style={[styles.filterLabel, active && styles.filterLabelActive]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {locating ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Chiedo la posizione…</Text>
        </View>
      ) : Boolean(coords) &&
        placesQuery.isFetching &&
        !placesTimedOut &&
        !placesQuery.isError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Cerco i posti giusti vicino a voi…</Text>
        </View>
      ) : locationFailure || !coords ? (
        <View style={styles.fallback}>
          <Text style={styles.muted}>
            {locationFailure
              ? locationFailureCopy(locationFailure)
              : 'Attiva la posizione per le distanze. Puoi comunque aprire la mappa.'}
          </Text>
          <FallbackButton
            label="Attiva / riprova posizione"
            onPress={() => setLocationTick((v) => v + 1)}
          />
          <FallbackButton
            label="Apri mappa — aree cani"
            onPress={() => openMaps('area sgambamento cani vicino a me')}
            outline
          />
          <FallbackButton
            label="Apri mappa — veterinari"
            onPress={() => openMaps('veterinario vicino a me')}
            outline
          />
        </View>
      ) : placesQuery.isError || placesTimedOut ? (
        <View style={styles.fallback}>
          <Text style={styles.muted}>
            Non riesco a caricare i luoghi adesso. Apri la mappa oppure riprova.
          </Text>
          <FallbackButton
            label="Riprova"
            onPress={() => {
              setPlacesTimedOut(false);
              void placesQuery.refetch();
            }}
          />
          <FallbackButton
            label="Apri mappa nelle vicinanze"
            onPress={() => openMaps('parco cani')}
            outline
          />
        </View>
      ) : filteredPlaces.length === 0 ? (
        <View style={styles.fallback}>
          <Text style={styles.muted}>
            {placeFilter === 'ALL'
              ? 'Nessun luogo utile vicino, per ora.'
              : placeFilter === 'PARK'
                ? 'Nessun parco o area cani qui intorno.'
                : 'Nessun veterinario qui intorno.'}
          </Text>
          <FallbackButton
            label="Apri mappa"
            onPress={() =>
              openMaps(placeFilter === 'VET' ? 'veterinario' : 'parco cani')
            }
          />
        </View>
      ) : (
        <View style={styles.list}>
          {filteredPlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </View>
      )}
    </View>
  );
}

function PlaceCard({ place }: { place: NearbyPlace }) {
  const isVet = place.kind === 'VET';
  const phoneHref = place.phone ? `tel:${place.phone}` : null;
  return (
    <View style={styles.placeCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apri ${place.name} sulla mappa`}
        onPress={() => void Linking.openURL(place.maps_url)}
        style={({ pressed }) => [styles.placeMain, pressed && styles.pressed]}
      >
        <View style={[styles.placeIcon, isVet && styles.placeIconWarm]}>
          <CuteIcon
            name={isVet ? 'heart' : 'leaf'}
            size={22}
            color={isVet ? '#B45309' : colors.accent}
            secondary={isVet ? '#FEF3C7' : colors.accentSoft}
          />
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.placeTitle} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.placeMeta}>
            {isVet ? 'Veterinario' : 'Parco / area cani'} ·{' '}
            {formatDistance(place.distance_m)}
          </Text>
        </View>
        <Ionicons name="map-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {phoneHref ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chiama ${place.name}`}
          onPress={() => void Linking.openURL(phoneHref)}
          style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
        >
          <Ionicons name="call" size={15} color="#FFFFFF" />
          <Text style={styles.callBtnText}>Chiama ora</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FallbackButton({
  label,
  onPress,
  outline,
}: {
  label: string;
  onPress: () => void;
  outline?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.fallbackBtn, outline && styles.fallbackBtnOutline]}
    >
      <Text
        style={[styles.fallbackBtnText, outline && styles.fallbackBtnTextOutline]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, paddingHorizontal: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  filterPill: {
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
  },
  filterPillActive: { backgroundColor: colors.accent },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  filterLabelActive: { color: colors.textOnPrimary },
  muted: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  fallback: { gap: spacing.sm },
  fallbackBtn: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackBtnOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallbackBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  fallbackBtnTextOutline: { color: colors.primary },
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIconWarm: { backgroundColor: '#FEF3C7' },
  placeCopy: { flex: 1, gap: 2 },
  placeTitle: {
    color: colors.text,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.md,
  },
  placeMeta: { color: colors.textSecondary, fontSize: 12 },
  callBtn: {
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: '#B45309',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  pressed: { opacity: 0.84 },
});

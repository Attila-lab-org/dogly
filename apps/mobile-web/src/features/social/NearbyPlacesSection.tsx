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
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { CuteIcon } from '@/components/CuteIcon';
import { SkeletonCard } from '@/components/Skeleton';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  fetchNearbyPlaces,
  formatDistance,
  locationFailureCopy,
  readDeviceLocationResult,
  type LocationFailureReason,
  type NearbyPlace,
} from '@/features/places/api';

function mapsSearchUrl(query: string, coords?: { lat: number; lng: number } | null) {
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&center=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Mappa stilizzata decorativa dietro le card luoghi: strade chiare, blob
 * parco verde, blob acqua azzurro, pin teal. Statica, nascosta agli AT.
 */
function StylizedMapBg() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 400 320"
      preserveAspectRatio="xMidYMid slice"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* strade */}
      <Path d="M-20 90 C80 70 200 110 420 80" stroke="#E4EAF1" strokeWidth={16} fill="none" />
      <Path d="M60 -20 C80 90 40 220 90 340" stroke="#E4EAF1" strokeWidth={13} fill="none" />
      <Path d="M-20 220 C120 240 260 200 420 230" stroke="#EAEFF5" strokeWidth={11} fill="none" />
      <Path d="M220 -20 C240 80 200 180 260 340" stroke="#EAEFF5" strokeWidth={9} fill="none" />
      {/* blob parco */}
      <Ellipse cx={320} cy={60} rx={80} ry={48} fill="#DFF3EC" />
      <Path d="M300 40 c4 -10 14 -12 18 -2 c6 -8 16 -4 14 6 c10 0 12 10 4 14 l-40 4 c-8 -4 -4 -16 4 -22 Z" fill="#B8E3D2" />
      {/* blob acqua */}
      <Ellipse cx={70} cy={270} rx={70} ry={40} fill="#DCEBFE" />
      <Path d="M40 268 q10 -8 20 0 q10 8 20 0 q10 -8 20 0" stroke="#C9E7FB" strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* pin */}
      <Path d="M150 130 c-8 -10 -6 -24 6 -28 c12 -4 24 4 24 16 c0 10 -14 20 -18 30 c-4 -8 -10 -10 -12 -18 Z" fill={colors.accent} />
      <Circle cx={165} cy={114} r={5} fill="#FFFFFF" />
      <Path d="M330 190 c-6 -8 -5 -18 4 -21 c9 -3 18 3 18 12 c0 8 -10 15 -14 23 c-3 -6 -7 -8 -8 -14 Z" fill={colors.primary} opacity={0.85} />
    </Svg>
  );
}

export function NearbyPlacesSection() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationFailure, setLocationFailure] =
    useState<LocationFailureReason | null>(null);
  const [locationTick, setLocationTick] = useState(0);
  const [placesTimedOut, setPlacesTimedOut] = useState(false);

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
    queryFn: () =>
      fetchNearbyPlaces({
        lat: coords!.lat,
        lng: coords!.lng,
        radius_m: 12_000,
      }),
    enabled: Boolean(coords),
    retry: 1,
  });

  useEffect(() => {
    if (!coords || !placesQuery.isFetching) {
      setPlacesTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setPlacesTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [coords, placesQuery.isFetching]);

  const filteredPlaces = useMemo(
    () => placesQuery.data?.items ?? [],
    [placesQuery.data],
  );

  const openMaps = (query: string) => {
    void Linking.openURL(mapsSearchUrl(query, coords));
  };

  return (
    <View style={styles.root}>
      <StylizedMapBg />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Luoghi utili</Text>
        <Ionicons name="location-outline" size={20} color={colors.accent} />
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
        <View style={{ gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
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
            Nessun luogo utile vicino, per ora.
          </Text>
          <FallbackButton
            label="Apri mappa"
            onPress={() => openMaps('parco cani')}
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
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
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

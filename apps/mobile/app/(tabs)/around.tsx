import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { CuteIcon } from '@/components/CuteIcon';
import { useDogProfile } from '@/features/core/useDogProfile';
import { fetchDogPhotos } from '@/features/photos/api';
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

export default function AroundScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationFailure, setLocationFailure] = useState<LocationFailureReason | null>(null);
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

  const photosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 5],
    queryFn: () => fetchDogPhotos(dog.id, 5),
    enabled: Boolean(dog.id),
  });
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

  const photos = photosQuery.data ?? [];
  const places = useMemo(
    () => placesQuery.data?.items ?? [],
    [placesQuery.data],
  );
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter>('ALL');
  const filteredPlaces = useMemo(
    () =>
      placeFilter === 'ALL'
        ? places
        : places.filter((place) => place.kind === placeFilter),
    [places, placeFilter],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>CERCA</Text>
            <Text style={styles.title}>Momenti e luoghi utili</Text>
            <Text style={styles.subtitle}>
              I ricordi di {dog.name} e i posti utili vicino a voi.
            </Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Momenti di {dog.name}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
            >
              <Text style={styles.link}>Album</Text>
            </Pressable>
          </View>

          {photos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryRow}
            >
              {photos.slice(0, 5).map((photo) => (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={photo.caption || 'Apri momento'}
                  onPress={() =>
                    router.push(
                      `/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
                    )
                  }
                  style={styles.galleryThumb}
                >
                  <Image source={{ uri: photo.thumbnailUri }} style={styles.galleryImage} resizeMode="cover" />
                </Pressable>
              ))}
              {photos.length > 5 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Apri l'album completo"
                  onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
                  style={[styles.galleryThumb, styles.galleryMore]}
                >
                  <Text style={styles.moreText}>+{photos.length - 5}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
              style={styles.galleryEmpty}
            >
              <Ionicons name="images-outline" size={24} color={colors.accent} />
              <Text style={styles.emptyText}>Aggiungi i primi momenti all’album.</Text>
            </Pressable>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Luoghi utili nelle vicinanze</Text>
            <Ionicons name="location-outline" size={22} color={colors.accent} />
          </View>

          {locating ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.emptyText}>Chiedo la posizione…</Text>
            </View>
          ) : Boolean(coords) && placesQuery.isFetching && !placesTimedOut && !placesQuery.isError ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.emptyText}>Cerco posti vicini…</Text>
            </View>
          ) : locationFailure || !coords ? (
            <View style={styles.fallback}>
              <Text style={styles.emptyText}>
                {locationFailure
                  ? locationFailureCopy(locationFailure)
                  : 'Attiva la posizione per vedere distanze e posti vicini. Puoi comunque aprire la mappa.'}
              </Text>
              <PlaceFallback
                title="Riprova la posizione"
                button="Attiva / riprova"
                onPress={() => setLocationTick((value) => value + 1)}
              />
              <PlaceFallback
                title="Aree per correre e giocare"
                button="Cerca aree vicine"
                onPress={() =>
                  void Linking.openURL(
                    'https://www.google.com/maps/search/?api=1&query=' +
                      encodeURIComponent('area sgambamento cani vicino a me'),
                  )
                }
              />
              <PlaceFallback
                title="Veterinari vicini"
                button="Trova un veterinario"
                onPress={() =>
                  void Linking.openURL(
                    'https://www.google.com/maps/search/?api=1&query=' +
                      encodeURIComponent('veterinario vicino a me'),
                  )
                }
              />
            </View>
          ) : placesQuery.isError || placesTimedOut ? (
            <View style={styles.fallback}>
              <Text style={styles.emptyText}>
                Non riesco a caricare i luoghi adesso. Riprova tra poco oppure apri la mappa.
              </Text>
              <PlaceFallback
                title="Riprova"
                button="Carica di nuovo"
                onPress={() => {
                  setPlacesTimedOut(false);
                  void placesQuery.refetch();
                }}
              />
              <PlaceFallback
                title="Apri la mappa"
                button="Cerca nelle vicinanze"
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('parco cani')}&query_place_id=&center=${coords.lat},${coords.lng}`,
                  )
                }
              />
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.fallback}>
              <Text style={styles.emptyText}>
                Non ho trovato posti nominati qui intorno. Prova la ricerca sulla mappa.
              </Text>
              <PlaceFallback
                title="Apri la mappa"
                button="Cerca nelle vicinanze"
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('parco cani')}&query_place_id=&center=${coords.lat},${coords.lng}`,
                  )
                }
              />
            </View>
          ) : (
            <View style={styles.placeList}>
              {cards.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PlaceCard({ place }: { place: NearbyPlace }) {
  const tone = place.kind === 'VET' ? 'warm' : 'cool';
  const phoneHref = place.phone ? `tel:${place.phone}` : null;
  return (
    <View style={styles.placeCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apri ${place.name} sulla mappa`}
        onPress={() => void Linking.openURL(place.maps_url)}
        style={({ pressed }) => [styles.placeMain, pressed && styles.pressed]}
      >
        <View style={[styles.placeIcon, tone === 'warm' && styles.placeIconWarm]}>
          <Ionicons
            name={place.kind === 'VET' ? 'medkit-outline' : 'paw-outline'}
            size={22}
            color={tone === 'warm' ? '#B45309' : colors.primary}
          />
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.placeTitle} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.placeMeta}>
            {place.kind === 'VET' ? 'Veterinario' : 'Parco / area cani'} ·{' '}
            {formatDistance(place.distance_m)}
          </Text>
        </View>
        <Ionicons name="map-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {phoneHref ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chiama ora ${place.name}`}
          onPress={() => void Linking.openURL(phoneHref)}
          style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
        >
          <Ionicons name="call" size={16} color="#FFFFFF" />
          <Text style={styles.callButtonText}>Chiama ora</Text>
        </Pressable>
      ) : place.kind === 'VET' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri ${place.name} sulla mappa per chiamare`}
          onPress={() => void Linking.openURL(place.maps_url)}
          style={({ pressed }) => [styles.callButtonSecondary, pressed && styles.pressed]}
        >
          <Ionicons name="call-outline" size={16} color={colors.primary} />
          <Text style={styles.callButtonSecondaryText}>Apri per chiamare</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PlaceFallback({
  title,
  button,
  onPress,
}: {
  title: string;
  button: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.fallbackCard}>
      <Text style={styles.placeTitle}>{title}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.fallbackButton}>
        <Text style={styles.fallbackButtonText}>{button}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  header: { gap: spacing.xs, paddingBottom: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: '700',
  },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: '700' },
  link: { color: colors.primary, fontWeight: '700' },
  gallery: { flexDirection: 'row', gap: 10, height: 210 },
  galleryLarge: { flex: 1.2, borderRadius: 18, overflow: 'hidden' },
  gallerySide: { flex: 1, gap: 10 },
  gallerySmall: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  galleryImage: { width: '100%', height: '100%' },
  moreOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#FFFFFF', fontWeight: '700', fontSize: 22 },
  galleryEmpty: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyText: { color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center' },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  placeList: { gap: spacing.sm },
  placeCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIconWarm: { backgroundColor: '#FEF3C7' },
  placeCopy: { flex: 1, gap: 2 },
  placeTitle: { color: colors.text, fontWeight: '700', fontSize: typography.size.md },
  placeMeta: { color: colors.textSecondary, fontSize: 12 },
  callButton: {
    alignSelf: 'stretch',
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: '#B45309',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: typography.size.sm },
  callButtonSecondary: {
    alignSelf: 'stretch',
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callButtonSecondaryText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: typography.size.sm,
  },
  fallback: { gap: spacing.sm },
  fallbackCard: {
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  fallbackButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  fallbackButtonText: { color: '#FFFFFF', fontWeight: '700' },
  pressed: { opacity: 0.84 },
});

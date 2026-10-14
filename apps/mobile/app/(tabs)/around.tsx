import React, { useEffect, useState } from 'react';
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
import { useDogProfile } from '@/features/core/useDogProfile';
import { fetchDogPhotos } from '@/features/photos/api';
import {
  fetchNearbyPlaces,
  formatDistance,
  readDeviceLocation,
  type NearbyPlace,
} from '@/features/places/api';

export default function AroundScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    void readDeviceLocation().then((value) => {
      if (!alive) return;
      setLocating(false);
      if (!value) {
        setLocationDenied(true);
        return;
      }
      setCoords(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const photosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 5],
    queryFn: () => fetchDogPhotos(dog.id, 5),
    enabled: Boolean(dog.id),
  });
  const placesQuery = useQuery({
    queryKey: ['nearby-places', coords?.lat, coords?.lng],
    queryFn: () => fetchNearbyPlaces({ lat: coords!.lat, lng: coords!.lng }),
    enabled: Boolean(coords),
  });

  const photos = photosQuery.data ?? [];
  const places = placesQuery.data?.items ?? [];
  const parks = places.filter((item) => item.kind === 'PARK').slice(0, 3);
  const vets = places.filter((item) => item.kind === 'VET').slice(0, 3);
  const cards = [...parks, ...vets].slice(0, 4);

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
            <View style={styles.gallery}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    `/dogs/${dog.id}/album/photo/${photos[0].id}?albumId=${photos[0].albumId}` as never,
                  )
                }
                style={styles.galleryLarge}
              >
                <Image source={{ uri: photos[0].thumbnailUri }} style={styles.galleryImage} resizeMode="cover" />
              </Pressable>
              <View style={styles.gallerySide}>
                {photos.slice(1, 3).map((photo, index) => (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        `/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
                      )
                    }
                    style={styles.gallerySmall}
                  >
                    <Image source={{ uri: photo.thumbnailUri }} style={styles.galleryImage} resizeMode="cover" />
                    {index === 1 && photos.length > 3 ? (
                      <View style={styles.moreOverlay}>
                        <Text style={styles.moreText}>+{photos.length - 2}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
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

          {locating || placesQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.emptyText}>Cerco posti vicini…</Text>
            </View>
          ) : locationDenied || !coords ? (
            <View style={styles.fallback}>
              <Text style={styles.emptyText}>
                Attiva la posizione per vedere distanze e posti vicini. Puoi comunque aprire la mappa.
              </Text>
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
                    `https://www.google.com/maps/search/?api=1&query=parco+cani&query_place_id=&center=${coords.lat},${coords.lng}`,
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void Linking.openURL(place.maps_url)}
      style={({ pressed }) => [styles.placeCard, pressed && styles.pressed]}
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
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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

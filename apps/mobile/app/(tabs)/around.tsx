import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { fetchDogPhotos } from '@/features/photos/api';
import { useQuery } from '@tanstack/react-query';

function openMap(query: string) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  void Linking.openURL(url);
}

export default function AroundScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const photosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 5],
    queryFn: () => fetchDogPhotos(dog.id, 5),
    enabled: Boolean(dog.id),
  });
  const photos = photosQuery.data ?? [];
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel="Torna a Mio Cane" onPress={() => router.replace('/(tabs)/rocky')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="arrow-back" size={22} color={colors.primary} /><Text style={{ color: colors.primary }}>Mio Cane</Text></Pressable>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Momenti di {dog.name}</Text><Pressable accessibilityRole="button" onPress={() => router.push(`/dogs/${dog.id}/album` as never)}><Text style={styles.link}>Apri album</Text></Pressable></View>
          {photos.length > 0 ? <View style={styles.gallery}><Pressable accessibilityRole="button" onPress={() => router.push(`/dogs/${dog.id}/album/photo/${photos[0].id}?albumId=${photos[0].albumId}` as never)} style={styles.galleryLarge}><Image source={{ uri: photos[0].thumbnailUri }} style={styles.galleryImage} /></Pressable><View style={styles.gallerySide}>{photos.slice(1, 3).map((photo) => <Pressable key={photo.id} accessibilityRole="button" onPress={() => router.push(`/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never)} style={styles.gallerySmall}><Image source={{ uri: photo.thumbnailUri }} style={styles.galleryImage} /></Pressable>)}</View></View> : <View style={styles.galleryEmpty}><Ionicons name="images-outline" size={24} color={colors.accent} /><Text style={styles.emptyText}>Aggiungi i primi momenti di {dog.name} all’album.</Text></View>}
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Luoghi utili nelle vicinanze</Text><Ionicons name="location-outline" size={22} color={colors.accent} /></View>
          <PlaceCard
            icon="paw-outline"
            title="Aree per correre e giocare"
            text="Trova aree di sgambamento e parchi per cani nelle vicinanze."
            button="Cerca aree vicine"
            onPress={() => openMap('area sgambamento cani vicino a me')}
          />
          <PlaceCard
            icon="medkit-outline"
            tone="warm"
            title="Veterinari vicini"
            text="Trova una struttura da contattare quando hai bisogno di assistenza."
            button="Trova un veterinario"
            onPress={() => openMap('veterinario vicino a me')}
          />
          <View style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.accent} />
            <Text style={styles.noteText}>Per un’emergenza vera, chiama subito i servizi locali. La mappa ti aiuta a trovare il posto giusto.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PlaceCard({ icon, tone, title, text, button, onPress }: { icon: keyof typeof Ionicons.glyphMap; tone?: 'warm'; title: string; text: string; button: string; onPress: () => void }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, tone === 'warm' && styles.cardIconWarm]}><Ionicons name={icon} size={24} color={tone === 'warm' ? '#B45309' : colors.primary} /></View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>{button}</Text><Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, safe: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { flex: 1, color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  link: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  gallery: { flexDirection: 'row', gap: spacing.sm, height: 190 },
  galleryLarge: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  gallerySide: { flex: 1, gap: spacing.sm },
  gallerySmall: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  galleryImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  galleryEmpty: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 18, backgroundColor: colors.accentSoft },
  emptyText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  cardIconWarm: { backgroundColor: '#FEF3C7' }, cardTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  cardText: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  button: { marginTop: spacing.sm, minHeight: 46, borderRadius: radius.full, paddingHorizontal: spacing.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonText: { color: '#FFFFFF', fontSize: typography.size.sm, fontWeight: typography.weight.bold }, pressed: { opacity: 0.82 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: 18 },
});

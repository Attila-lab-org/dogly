import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useDogProfile } from '@/features/core/useDogProfile';
import { PhotoThumbnail } from '@/features/photos/components';
import { fetchDogPhotos } from '@/features/photos/api';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { sexLabel } from '@/features/dogs/map';
import { useSession } from '@/features/auth/SessionProvider';
import { isPersistedId } from '@/lib/persistedId';
import { usePersonalPatterns } from '@/features/patterns/api';
import { DogCareOverview } from '@/features/dogs/DogCareOverview';
import { CuteIcon } from '@/components/CuteIcon';
import { colors } from '@/theme/tokens';

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const { width } = useWindowDimensions();
  const photoSize = Math.floor((Math.min(width, 560) - 48) / 3);
  const photos = useQuery({ queryKey: ['gallery-dog-photos', dog.id, 3], queryFn: () => fetchDogPhotos(dog.id, 3), enabled: !usingMockGate && isPersistedId(dog.id), staleTime: 30_000 });
  const patterns = usePersonalPatterns(dog.id);
  const learned = patterns.patterns.filter((item) => item.state !== 'ARCHIVED').slice(0, 2);
  const meta = [currentAgeLabel(dog.birthDate, dog.ageLabel), sexLabel(dog.sex)].filter(Boolean).join(' · ');
  const extraMeta = [dog.breedLabel, dog.sizeLabel, dog.weightKg ? `${String(dog.weightKg).replace('.', ',')} kg` : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {dog.photoUri ? <Image source={{ uri: dog.photoUri }} style={styles.heroPhoto} accessibilityLabel={`Foto di ${dog.name}`} /> : <View style={styles.heroEmpty}><Ionicons name="paw-outline" size={70} color={colors.primary} /><Text style={styles.emptyText}>Aggiungi la sua foto da Modifica</Text></View>}
          <SafeAreaView edges={['top']} style={styles.heroControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Torna alla Home" onPress={() => router.replace('/(tabs)/home')} style={styles.heroButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Impostazioni" onPress={() => router.push('/settings')} style={styles.heroButton}><Ionicons name="settings-outline" size={24} color={colors.text} /></Pressable>
          </SafeAreaView>
        </View>
        <View style={styles.sheet}>
          <View style={styles.identity}>
            <View style={styles.identityCopy}><Text style={styles.name}>{dog.name || 'Il tuo cane'}</Text>{meta ? <Text style={styles.meta}>{meta}</Text> : null}</View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Modifica profilo di ${dog.name}`} onPress={() => router.push(`/dogs/${dog.id}/edit` as never)} style={styles.pill}><Text style={styles.pillText}>Modifica</Text></Pressable>
          </View>
          {extraMeta ? <Text style={styles.extraMeta}>{extraMeta}</Text> : null}
          <DogCareOverview dogId={dog.id} dogName={dog.name} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri i giochi da fare con ${dog.name}`}
            onPress={() => router.push('/games' as never)}
            style={styles.gamesCard}
          >
            <View style={styles.gamesIcon}><CuteIcon name="play" size={22} color={colors.accent} secondary={colors.accentSoft} /></View>
            <View style={styles.identityCopy}><Text style={styles.linkTitle}>Giochi insieme</Text><Text style={styles.meta}>Scoiattolo! e altre sfide da tre minuti</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>I suoi momenti</Text><Pressable accessibilityRole="button" accessibilityLabel="Apri album" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} style={styles.pill}><Text style={styles.pillText}>Apri album</Text></Pressable></View>
          {photos.isLoading ? <Text style={styles.emptyText}>Carico i suoi momenti…</Text> : photos.isError ? <Pressable onPress={() => void photos.refetch()} accessibilityRole="button"><Text style={styles.pillText}>Non riesco a caricare le foto · Riprova</Text></Pressable> : (photos.data ?? []).length > 0 ? <View style={styles.photoRow}>{(photos.data ?? []).slice(0, 3).map((photo) => <PhotoThumbnail key={photo.id} photo={photo} size={photoSize} onPress={() => router.push(`/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never)} />)}</View> : <ProfileLink icon="images-outline" title="Aggiungi una foto" detail="I vostri momenti preferiti" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} />}
          {learned.length > 0 || (patterns.live && (patterns.isLoading || patterns.isError)) ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Cosa sto imparando</Text>
                <Pressable onPress={() => router.push('/patterns')} accessibilityRole="button">
                  <Text style={styles.pillText}>Vedi tutto</Text>
                </Pressable>
              </View>
              <View style={styles.card}>
                {patterns.live && patterns.isLoading ? (
                  <Text style={styles.emptyText}>Sto iniziando a conoscere {dog.name}…</Text>
                ) : patterns.live && patterns.isError ? (
                  <Pressable accessibilityRole="button" onPress={() => void patterns.refetch()}>
                    <Text style={styles.pillText}>Non riesco a caricare le abitudini · Riprova</Text>
                  </Pressable>
                ) : (
                  learned.map((pattern) => (
                    <Pressable
                      key={pattern.id}
                      onPress={() => router.push(`/patterns/${pattern.id}`)}
                      accessibilityRole="button"
                      style={styles.patternRow}
                    >
                      <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
                      <Text style={styles.patternText}>{pattern.title}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </Pressable>
                  ))
                )}
              </View>
            </>
          ) : null}
          <ProfileLink icon="bookmark-outline" title="Informazioni che ricordo" detail="Puoi rivederle, correggerle o eliminarle." onPress={() => router.push(`/dogs/${dog.id}/memories` as never)} />
        </View>
      </ScrollView>
    </View>
  );
}
function ProfileLink({ icon, title, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={styles.link}><Ionicons name={icon} size={23} color={colors.primary} /><View style={styles.identityCopy}><Text style={styles.linkTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /></Pressable>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 24 },
  hero: { height: 245, backgroundColor: colors.primarySoft },
  heroPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroControls: { position: 'absolute', top: 0, left: 0, right: 0, padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  sheet: { marginTop: -30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, padding: 16, gap: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityCopy: { flex: 1, gap: 4 },
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  extraMeta: { fontSize: 13, color: colors.textSecondary, paddingBottom: 2 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primarySoft },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  photoRow: { flexDirection: 'row', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 },
  link: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  gamesCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  gamesIcon: { width: 44, height: 44, borderRadius: 999, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  patternRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  patternText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});

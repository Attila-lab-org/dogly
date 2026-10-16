import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
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
import { useAvatarPalette } from '@/features/dogs/avatarTint';
import { usePressSpring } from '@/components/pressSpring';
import { SpringPress } from '@/components/pressSpring';
import { WorldBackdrop } from '@/components/WorldBackdrop';
import { hapticLight } from '@/lib/haptics';
import { colors, shadows } from '@/theme/tokens';

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const { width } = useWindowDimensions();
  const photoSize = Math.floor((Math.min(width, 560) - 48) / 3);
  // Tinta dal pelo: hero e accenti soft seguono il colore della sua foto.
  const palette = useAvatarPalette(dog.id, dog.photoUri);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const heroParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value) * 0.35 }],
  }));
  const photos = useQuery({ queryKey: ['gallery-dog-photos', dog.id, 3], queryFn: () => fetchDogPhotos(dog.id, 3), enabled: !usingMockGate && isPersistedId(dog.id), staleTime: 30_000 });
  const patterns = usePersonalPatterns(dog.id);
  const learned = patterns.patterns.filter((item) => item.state !== 'ARCHIVED').slice(0, 2);
  const meta = [currentAgeLabel(dog.birthDate, dog.ageLabel), sexLabel(dog.sex)].filter(Boolean).join(' · ');
  const extraMeta = [dog.breedLabel, dog.sizeLabel, dog.weightKg ? `${String(dog.weightKg).replace('.', ',')} kg` : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.root}>
      <WorldBackdrop world="profile" accent={palette.heroFrom} />
      <Animated.ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onScroll={scrollHandler} scrollEventThrottle={16}>
        <View style={styles.hero}>
          <LinearGradient
            colors={[palette.heroFrom, palette.heroTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {dog.photoUri ? (
            <Animated.View style={[styles.heroPhotoWrap, heroParallax]}>
              <Image source={{ uri: dog.photoUri }} style={styles.heroPhoto} accessibilityLabel={`Foto di ${dog.name}`} />
            </Animated.View>
          ) : <View style={styles.heroEmpty}><Ionicons name="paw-outline" size={70} color={colors.primary} /><Text style={styles.emptyText}>Aggiungi la sua foto da Modifica</Text></View>}
          <View pointerEvents="none" style={[styles.heroTint, { backgroundColor: palette.heroFrom }]} />
          <LinearGradient colors={['rgba(14,42,71,0)', 'rgba(14,42,71,0.66)']} style={styles.heroShade} pointerEvents="none" />
          <View style={styles.heroLabel} pointerEvents="none">
            <Text style={styles.heroEyebrow}>IL MONDO DI</Text>
            <Text style={styles.heroWorldName}>{dog.name || 'Il tuo cane'}</Text>
          </View>
          <SafeAreaView edges={['top']} style={styles.heroControls}>
            <SpringPress accessibilityRole="button" accessibilityLabel="Torna alla Home" onPress={() => router.replace('/(tabs)/home')} pressableStyle={styles.heroButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></SpringPress>
            <SpringPress accessibilityRole="button" accessibilityLabel="Impostazioni" onPress={() => router.push('/settings')} pressableStyle={styles.heroButton}><Ionicons name="settings-outline" size={24} color={colors.text} /></SpringPress>
          </SafeAreaView>
        </View>
        <View style={[styles.sheet, { backgroundColor: palette.heroTo }]}>
          <View style={styles.identity}>
            <View style={[styles.identityAvatarWrap, { borderColor: palette.heroFrom }]}>
              {dog.photoUri ? <Image source={{ uri: dog.photoUri }} style={styles.identityAvatar} accessibilityLabel={`Avatar di ${dog.name}`} /> : <Ionicons name="paw" size={22} color={palette.heroFrom} />}
            </View>
            <View style={styles.identityCopy}><Text style={styles.name}>{dog.name || 'Il tuo cane'}</Text>{meta ? <Text style={styles.meta}>{meta}</Text> : null}</View>
            <ProfileAction icon="create-outline" label="Modifica profilo" accessibilityLabel={`Modifica profilo di ${dog.name}`} onPress={() => router.push(`/dogs/${dog.id}/edit` as never)} />
          </View>
          {extraMeta ? <Text style={styles.extraMeta}>{extraMeta}</Text> : null}
          <DogCareOverview dogId={dog.id} dogName={dog.name} />
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>I suoi momenti</Text><ProfileAction icon="images-outline" label="Album" variant="secondary" accessibilityLabel="Apri album" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} /></View>
          {photos.isLoading ? <Text style={styles.emptyText}>Carico i suoi momenti…</Text> : photos.isError ? <SpringPress onPress={() => void photos.refetch()} accessibilityRole="button" pressableStyle={styles.retryAction}><Text style={styles.pillText}>Non riesco a caricare le foto · Riprova</Text></SpringPress> : (photos.data ?? []).length > 0 ? <View style={styles.photoRow}>{(photos.data ?? []).slice(0, 3).map((photo) => <PhotoThumbnail key={photo.id} photo={photo} size={photoSize} onPress={() => router.push(`/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never)} />)}</View> : <ProfileLink icon="images-outline" title="Aggiungi una foto" detail="I vostri momenti preferiti" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} />}
          {learned.length > 0 || (patterns.live && (patterns.isLoading || patterns.isError)) ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Cosa sto imparando</Text>
                <SpringPress onPress={() => router.push('/patterns')} accessibilityRole="button" pressableStyle={styles.plainAction}>
                  <Text style={styles.pillText}>Vedi tutto</Text>
                </SpringPress>
              </View>
              <View style={styles.card}>
                {patterns.live && patterns.isLoading ? (
                  <Text style={styles.emptyText}>Sto iniziando a conoscere {dog.name}…</Text>
                ) : patterns.live && patterns.isError ? (
                  <SpringPress accessibilityRole="button" onPress={() => void patterns.refetch()} pressableStyle={styles.retryAction}>
                    <Text style={styles.pillText}>Non riesco a caricare le abitudini · Riprova</Text>
                  </SpringPress>
                ) : (
                  learned.map((pattern) => (
                    <SpringPress
                      key={pattern.id}
                      onPress={() => router.push(`/patterns/${pattern.id}`)}
                      accessibilityRole="button"
                      pressableStyle={styles.patternRow}
                    >
                      <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
                      <Text style={styles.patternText}>{pattern.title}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </SpringPress>
                  ))
                )}
              </View>
            </>
          ) : null}
          <ProfileLink icon="bookmark-outline" title="Informazioni che ricordo" detail="Puoi rivederle, correggerle o eliminarle." onPress={() => router.push(`/dogs/${dog.id}/memories` as never)} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}
function ProfileLink({ icon, title, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void }) {
  const press = usePressSpring();
  return (
    <Animated.View style={press.style}>
      <Pressable
        onPress={() => {
          void hapticLight();
          onPress();
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        style={styles.link}
      >
        <Ionicons name={icon} size={23} color={colors.primary} />
        <View style={styles.identityCopy}><Text style={styles.linkTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

function ProfileAction({
  icon,
  label,
  onPress,
  accessibilityLabel,
  variant = 'primary',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <SpringPress
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.actionWrap}
      pressableStyle={[styles.action, primary ? styles.actionPrimary : styles.actionSecondary]}
    >
      {primary ? <LinearGradient colors={[colors.primary, '#5B8CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <Ionicons name={icon} size={15} color={primary ? '#FFFFFF' : colors.primary} />
      <Text style={[styles.actionText, primary ? styles.actionTextPrimary : styles.actionTextSecondary]}>{label}</Text>
      {!primary ? <Ionicons name="chevron-forward" size={14} color={colors.primary} /> : null}
    </SpringPress>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 24 },
  hero: { height: 275, overflow: 'hidden' },
  heroPhotoWrap: { width: '100%', height: '134%' },
  heroPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroShade: StyleSheet.absoluteFill,
  heroTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.16 },
  heroLabel: { position: 'absolute', left: 18, bottom: 28, gap: 2 },
  heroEyebrow: { color: 'rgba(255,255,255,0.84)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  heroWorldName: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  heroControls: { position: 'absolute', top: 0, left: 0, right: 0, padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  sheet: { marginTop: -32, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: 'rgba(248,250,252,0.93)', padding: 18, gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityAvatarWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF6FF', borderWidth: 2, borderColor: 'rgba(37,99,235,0.16)', overflow: 'hidden' },
  identityAvatar: { width: '100%', height: '100%' },
  identityCopy: { flex: 1, gap: 4 },
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  extraMeta: { fontSize: 13, color: colors.textSecondary, paddingBottom: 2 },
  actionWrap: { borderRadius: 999, ...shadows.card },
  action: { minHeight: 40, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13, overflow: 'hidden' },
  actionPrimary: { backgroundColor: colors.primary },
  actionSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primarySoft, minHeight: 38, paddingHorizontal: 12 },
  actionText: { fontSize: 12, fontWeight: '700' },
  actionTextPrimary: { color: '#FFFFFF' },
  actionTextSecondary: { color: colors.primary },
  plainAction: { paddingVertical: 4, paddingHorizontal: 4 },
  retryAction: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.primarySoft },

  pillText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  photoRow: { flexDirection: 'row', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 },
  link: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  linkTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  patternRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  patternText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});

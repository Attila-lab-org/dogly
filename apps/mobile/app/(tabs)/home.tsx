/** Home: conversazione, momenti da mostrare e osservazioni da ritrovare. */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { HomeConversation } from '@/features/home/HomeConversation';
import { DogHero } from '@/features/home/DogHero';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { insightToneLabel } from '@/features/home/api';
import type { InsightTone, LastInsight } from '@/features/core/types';
import { DogCareOverview } from '@/features/dogs/DogCareOverview';
import { useQuery } from '@tanstack/react-query';
import { fetchDogPhotos } from '@/features/photos/api';
import { isPersistedId } from '@/lib/persistedId';
import { useSession } from '@/features/auth/SessionProvider';
import { purchasesEnabled } from '@/mocks/entitlements';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  // Entrata scenica: le entering animation di Reanimated corrono solo al
  // mount, quindi refresh/focus successivi non rianimano le sezioni.
  const sceneEnter = (delay: number) =>
    reducedMotion ? undefined : FadeInUp.duration(320).delay(delay);
  const { usage, recentInsights, processingEventId, loading, error, refetch } =
    useHomeData(dog.id);
  const network = useNetworkStatus();
  const { usingMockGate } = useSession();
  const photos = useQuery({ queryKey: ['gallery-dog-photos', dog.id, 3], queryFn: () => fetchDogPhotos(dog.id, 3), enabled: !usingMockGate && isPersistedId(dog.id) });

  const behaviorRemaining = usage
    ? usage.behaviorLimit - usage.behaviorUsed
    : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={styles.brand} accessible accessibilityLabel="Dogly">
              <Image source={logoMarkSource} style={styles.logoMark} resizeMode="contain" />
              <Text style={styles.wordmark}>Dogly</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerca luoghi utili"
                onPress={() => router.push('/(tabs)/around' as never)}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="search-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri il profilo del cane"
                onPress={() => router.push('/(tabs)/rocky')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                {dog.photoUri ? <Image source={{ uri: dog.photoUri }} style={styles.headerAvatar} /> : <Ionicons name="paw-outline" size={22} color={colors.text} />}
              </Pressable>
            </View>
          </View>

          {network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>
                Sei offline. La conversazione e le nuove letture richiedono connessione.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => void network.refresh()}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && !network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Preparo lo spazio di {dog.name}.</Text>
            </View>
          ) : null}

          {error && !network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>Non sono riuscito ad aggiornare i momenti.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare i momenti"
                onPress={refetch}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          ) : null}

          <Animated.View entering={sceneEnter(0)}>
            <DogHero dogId={dog.id} dogName={dog.name} photoUri={dog.photoUri} breedLabel={dog.breedLabel} />
          </Animated.View>

          {processingEventId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri la lettura in corso di ${dog.name}`}
              onPress={() => router.push(`/behavior/processing/${processingEventId}`)}
              style={styles.processingBanner}
            >
              <View style={styles.processingIcon}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <View style={styles.processingCopy}>
                <Text style={styles.processingTitle}>Sto leggendo il vostro momento</Text>
                <Text style={styles.processingText}>Puoi aprire lo stato e ritrovare il risultato nel Diario.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          ) : null}

          <Animated.View key={dog.id} entering={sceneEnter(90)}>
            <HomeConversation dogId={dog.id} dogName={dog.name} offline={network.offline} />
          </Animated.View>

          <Animated.View entering={sceneEnter(180)}>
            <DogCareOverview dogId={dog.id} dogName={dog.name} compact />
          </Animated.View>

          <Animated.View entering={sceneEnter(270)}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Momenti recenti</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri album"
                onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
                hitSlop={8}
              >
                <Text style={styles.seeAll}>Vedi tutti</Text>
              </Pressable>
            </View>
          </Animated.View>

          {photos.isLoading ? <Text style={styles.quota}>Carico i momenti…</Text> : photos.isError ? (
            <Pressable onPress={() => void photos.refetch()} accessibilityRole="button"><Text style={styles.seeAll}>Non riesco a caricare le foto · Riprova</Text></Pressable>
          ) : (photos.data ?? []).length > 0 ? (
            <View style={styles.momentsRow}>
              {(photos.data ?? []).slice(0, 3).map((photo) => (
                <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={photo.caption || 'Apri momento'}
                  onPress={() => router.push(`/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never)} style={styles.moment}>
                  <Image source={{ uri: photo.thumbnailUri }} style={styles.momentPhoto} />
                  <Text style={styles.insightTime} numberOfLines={1}>
                    {photo.caption || formatMomentStamp(photo.takenAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : <Pressable accessibilityRole="button" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} style={styles.emptyInsight}>
            <Ionicons name="images-outline" size={24} color={colors.primary} /><Text style={styles.emptyText}>Aggiungi i vostri momenti all’album</Text>
          </Pressable>}

          {recentInsights.length > 0 ? <>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Le ultime osservazioni</Text><Pressable onPress={() => router.push('/(tabs)/diary')} accessibilityRole="button"><Text style={styles.seeAll}>Diario</Text></Pressable></View>
            {recentInsights.map((insight) => <InsightCard key={insight.eventId} insight={insight} onPress={() => router.push(`/behavior/result/${insight.eventId}`)} />)}
          </> : null}

          {behaviorRemaining !== null && behaviorRemaining <= 2 ? (
            <Text style={behaviorRemaining <= 0 ? styles.quotaWarning : styles.quota}>
              {behaviorRemaining <= 0
                ? purchasesEnabled
                  ? 'Hai usato le letture disponibili. Puoi continuare dal tuo piano.'
                  : 'Le letture disponibili torneranno presto.'
                : `${behaviorRemaining} ${behaviorRemaining === 1 ? 'lettura disponibile' : 'letture disponibili'} questo mese.`}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function formatMomentStamp(iso: string): string {
  const date = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (value: Date) =>
    Date.parse(
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
    );
  const diff = Math.round((startOf(new Date()) - startOf(date)) / dayMs);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (diff <= 0) return `Oggi ${time}`;
  if (diff === 1) return `Ieri ${time}`;
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function InsightCard({
  insight,
  onPress,
}: {
  insight: LastInsight;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Apri la lettura: ${insight.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.insightCard, pressed && styles.pressed]}
    >
      <Text style={styles.insightTitle} numberOfLines={2}>{insight.label}</Text>
      <Text style={styles.insightTime}>{insight.timestampLabel}</Text>
      <TonePill tone={insight.tone} />
    </Pressable>
  );
}

function TonePill({ tone }: { tone: InsightTone }) {
  return (
    <View style={[styles.tonePill, tone === 'watch' && styles.tonePillWatch]}>
      <View style={[styles.toneDot, tone === 'watch' && styles.toneDotWatch]} />
      <Text style={styles.toneText}>{insightToneLabel(tone)}</Text>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { width: 30, height: 24 },
  wordmark: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  momentsRow: { flexDirection: 'row', gap: 10 },
  moment: { flex: 1, minWidth: 0, gap: 6 },
  momentPhoto: { width: '100%', aspectRatio: 1, borderRadius: 14 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.xs },
  statusRetry: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  processingIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.surface },
  processingCopy: { flex: 1, gap: 2 },
  processingTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  processingText: { color: colors.textSecondary, fontSize: typography.size.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  seeAll: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  insightCard: { width: '100%', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  insightTitle: { color: colors.text, fontSize: typography.size.sm, lineHeight: typography.size.sm * 1.25, fontWeight: typography.weight.bold },
  insightTime: { color: colors.textMuted, fontSize: typography.size.xs },
  tonePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.accentSoft },
  tonePillWatch: { backgroundColor: colors.warningSoft },
  toneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  toneDotWatch: { backgroundColor: colors.warning },
  toneText: { color: colors.textSecondary, fontSize: 10, fontWeight: typography.weight.bold },
  emptyInsight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.textSecondary, fontSize: typography.size.xs },
  quota: { color: colors.textMuted, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  quotaWarning: { color: colors.warning, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  pressed: { opacity: 0.84 },
});

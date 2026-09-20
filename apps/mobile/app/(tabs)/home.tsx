/**
 * Home: il gesto centrale di DOGly.
 *
 * La prima schermata deve aiutare il proprietario a fare una sola cosa:
 * mostrare un momento e capire meglio il proprio cane. Gli strumenti
 * secondari restano nel profilo e nel Diario, senza competere con questo
 * percorso.
 */
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
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { insightToneLabel } from '@/features/home/api';
import type { InsightTone, LastInsight } from '@/features/core/types';
import { purchasesEnabled } from '@/mocks/entitlements';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usage, recentInsights, processingEventId, loading, error, refetch } =
    useHomeData(dog.id);
  const network = useNetworkStatus();

  const behaviorRemaining = usage
    ? usage.behaviorLimit - usage.behaviorUsed
    : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;

  const startVideo = () => {
    if (!dog.id || loading) return;
    if (processingEventId) {
      router.push(`/behavior/processing/${processingEventId}`);
      return;
    }
    if (quotaExhausted && purchasesEnabled) {
      router.push('/paywall');
      return;
    }
    router.push('/behavior/capture');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.brand} accessible accessibilityLabel="Dogly">
              <Image source={logoMarkSource} style={styles.logoMark} resizeMode="contain" />
              <Text style={styles.wordmark}>Dogly</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri il Diario"
                onPress={() => router.push('/(tabs)/diary')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="book-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri il profilo del cane"
                onPress={() => router.push('/(tabs)/rocky')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="paw-outline" size={22} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>
                Sei offline. Le nuove letture richiedono connessione.
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

          <View style={styles.welcomeBlock}>
            <Text style={styles.eyebrow}>IL VOSTRO SPAZIO</Text>
            <Text style={styles.title}>Cosa sta vivendo {dog.name} oggi?</Text>
            <Text style={styles.subtitle}>
              Mostramelo e ti aiuterò a leggere quel momento con parole semplici.
            </Text>
          </View>

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
                <Text style={styles.processingText}>Ti avviso appena la spiegazione è pronta.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mostra a DOGly un momento di ${dog.name}`}
            onPress={startVideo}
            disabled={!dog.id || loading}
            style={({ pressed }) => [styles.primaryCard, pressed && styles.pressed]}
          >
            <View style={styles.primaryIcon}>
              <Ionicons name="videocam" size={25} color={colors.textOnPrimary} />
            </View>
            <View style={styles.primaryCopy}>
              <Text style={styles.primaryKicker}>IL MODO PIÙ VELOCE PER CAPIRLO</Text>
              <Text style={styles.primaryTitle}>Fammi vedere un momento</Text>
              <Text style={styles.primarySubtitle}>
                Un breve video. Ti restituisco cosa potrebbe significare e cosa puoi fare.
              </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={colors.textOnPrimary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Parla con DOGly di ${dog.name}`}
            onPress={() => router.push('/realtime' as never)}
            disabled={!dog.id}
            style={({ pressed }) => [styles.talkCard, pressed && styles.pressed]}
          >
            <View style={styles.talkIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.talkCopy}>
              <Text style={styles.talkTitle}>Vuoi parlarne?</Text>
              <Text style={styles.talkSubtitle}>Chiedimi qualcosa di {dog.name}.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          </Pressable>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Le vostre ultime letture</Text>
              <Text style={styles.sectionSubtitle}>Ogni momento ci aiuta a conoscerlo meglio.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apri tutte le letture nel Diario"
              onPress={() => router.push('/(tabs)/diary')}
              hitSlop={8}
            >
              <Text style={styles.seeAll}>Diario</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.insightRow}
          >
            {recentInsights.length > 0 ? (
              recentInsights.map((insight) => (
                <InsightCard
                  key={insight.eventId}
                  insight={insight}
                  photoUri={dog.photoUri}
                  onPress={() => router.push(`/behavior/result/${insight.eventId}`)}
                />
              ))
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Registra il primo momento di ${dog.name}`}
                onPress={startVideo}
                style={({ pressed }) => [styles.emptyInsight, pressed && styles.pressed]}
              >
                <View style={styles.emptyIcon}>
                  <Ionicons name="sparkles-outline" size={25} color={colors.primary} />
                </View>
                <View style={styles.emptyCopy}>
                  <Text style={styles.emptyTitle}>Il primo momento parte da qui</Text>
                  <Text style={styles.emptyText}>Quando vuoi, fammelo vedere.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </ScrollView>

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

function InsightCard({
  insight,
  photoUri,
  onPress,
}: {
  insight: LastInsight;
  photoUri: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Apri la lettura: ${insight.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.insightCard, pressed && styles.pressed]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.insightPhoto} />
      ) : (
        <View style={styles.insightPhotoPlaceholder}>
          <Ionicons name="paw-outline" size={25} color={colors.primary} />
        </View>
      )}
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
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  welcomeBlock: { paddingTop: spacing.xl, gap: spacing.sm },
  eyebrow: { color: colors.accentPressed, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: typography.size.xxl, lineHeight: typography.size.xxl * 1.15, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: typography.size.md * typography.lineHeight.relaxed },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  processingIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.surface },
  processingCopy: { flex: 1, gap: 2 },
  processingTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  processingText: { color: colors.textSecondary, fontSize: typography.size.xs },
  primaryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary, minHeight: 142 },
  primaryIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.18)' },
  primaryCopy: { flex: 1, gap: spacing.xs },
  primaryKicker: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 0.8 },
  primaryTitle: { color: colors.textOnPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
  primarySubtitle: { color: 'rgba(255,255,255,0.86)', fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.lineHeight.relaxed },
  talkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  talkIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.accentSoft },
  talkCopy: { flex: 1, gap: 2 },
  talkTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  talkSubtitle: { color: colors.textSecondary, fontSize: typography.size.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  sectionSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: typography.size.xs },
  seeAll: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  insightRow: { gap: spacing.md, paddingVertical: spacing.xs },
  insightCard: { width: 176, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  insightPhoto: { width: '100%', height: 112, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  insightPhotoPlaceholder: { width: '100%', height: 112, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primarySoft },
  insightTitle: { minHeight: 40, color: colors.text, fontSize: typography.size.sm, lineHeight: typography.size.sm * 1.25, fontWeight: typography.weight.bold },
  insightTime: { color: colors.textMuted, fontSize: typography.size.xs },
  tonePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.accentSoft },
  tonePillWatch: { backgroundColor: colors.warningSoft },
  toneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  toneDotWatch: { backgroundColor: colors.warning },
  toneText: { color: colors.textSecondary, fontSize: 10, fontWeight: typography.weight.bold },
  emptyInsight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.primarySoft },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  emptyText: { color: colors.textSecondary, fontSize: typography.size.xs },
  quota: { color: colors.textMuted, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  quotaWarning: { color: colors.warning, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  pressed: { opacity: 0.84 },
});

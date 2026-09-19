/**
 * Tab Home — layout mockup: saluto, storie, card cane,
 * CTA “Analizza un momento”, ultime analisi, consiglio randomico.
 * Stati obbligatori: offline, loading, errore, processing, quota.
 */
import React, { useEffect, useRef, useState } from 'react';
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
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StoriesRail } from '@/features/stories/StoriesRail';
import { useStories } from '@/features/stories/data';
import {
  currentAgeLabel,
  isBirthdayToday,
} from '@/features/dogs/profileDates';
import { sexLabel } from '@/features/dogs/map';
import {
  formatCareDate,
  relativeCareDate,
} from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { insightToneLabel } from '@/features/home/api';
import { nextHomeTip, pickHomeTip, type HomeTip } from '@/features/home/tips';
import { AnalyzeMomentSheet } from '@/features/home/AnalyzeMomentSheet';
import type { InsightTone, LastInsight } from '@/features/core/types';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const stories = useStories(dog.id, dog.name);
  const birthdayToday = isBirthdayToday(dog.birthDate);
  const {
    usage,
    recentInsights,
    processingEventId,
    loading,
    error,
    refetch,
  } = useHomeData(dog.id);

  const network = useNetworkStatus();
  const offline = network.offline;

  const behaviorRemaining = usage
    ? usage.behaviorLimit - usage.behaviorUsed
    : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;
  useCareEvents(dog.id, dog.name);
  const nextCare = nextCareEvent(dog.id);
  const ageLabel = currentAgeLabel(dog.birthDate, dog.ageLabel);
  const genderLabel = sexLabel(dog.sex);

  const [tip, setTip] = useState<HomeTip>(() => pickHomeTip(dog));
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const skipTipReset = useRef(true);
  useEffect(() => {
    if (skipTipReset.current) {
      skipTipReset.current = false;
      return;
    }
    setTip(pickHomeTip(dog));
  }, [dog.id, dog.name, dog.birthDate, dog.ageLabel, dog.breedLabel, dog.sex]);

  const greeting = birthdayToday
    ? `Buon compleanno, ${dog.name}!`
    : 'Ciao!';

  const openAnalyze = () => {
    if (!dog.id || loading) return;
    setAnalyzeOpen(true);
  };

  const startVideo = () => {
    setAnalyzeOpen(false);
    if (processingEventId) {
      router.push(`/behavior/processing/${processingEventId}`);
      return;
    }
    if (quotaExhausted) {
      router.push('/paywall');
      return;
    }
    router.push('/behavior/capture');
  };

  const startAudio = () => {
    setAnalyzeOpen(false);
    if (!dog.id) return;
    router.push('/realtime' as never);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.brand} accessible accessibilityLabel="Dogly">
              <Image
                source={logoMarkSource}
                style={styles.logoMark}
                resizeMode="contain"
              />
              <Text style={styles.wordmark}>Dogly</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri il diario"
                onPress={() => router.push('/(tabs)/diary')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="book-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  nextCare
                    ? 'Notifiche, hai un promemoria in agenda'
                    : 'Notifiche'
                }
                onPress={() => router.push('/notifications')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={colors.primary}
                />
                {nextCare ? <View style={styles.badge} /> : null}
              </Pressable>
            </View>
          </View>

          <Text style={styles.greeting} accessibilityRole="header">
            {greeting}
          </Text>
          <Text style={styles.tagline}>Il tuo cane, finalmente capito.</Text>

          <StoriesRail
            stories={stories}
            onAdd={() => router.push('/(tabs)/camera')}
            onOpen={(story) => router.push(`/stories/${story.id}` as never)}
          />

          {offline && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons
                name="cloud-offline-outline"
                size={18}
                color={colors.danger}
              />
              <Text style={styles.statusText}>
                Sei offline: ti mostro gli ultimi dati disponibili. Le nuove
                analisi richiedono connessione.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => {
                  void network.refresh();
                }}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          )}

          {loading && !offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>
                Sto caricando i dati di {dog.name}.
              </Text>
            </View>
          ) : null}

          {error && !offline ? (
            <View
              style={styles.statusBanner}
              accessibilityLiveRegion="assertive"
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.danger}
              />
              <Text style={styles.statusText}>
                Non sono riuscito ad aggiornare la Home.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare i dati"
                onPress={refetch}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          ) : null}

          {processingEventId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'analisi in corso di ${dog.name}`}
              onPress={() =>
                router.push(`/behavior/processing/${processingEventId}`)
              }
              style={styles.processingBanner}
            >
              <Ionicons
                name="hourglass-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.processingText}>
                Sto osservando il video: ti avviso quando è pronto
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.primary}
              />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri il profilo di ${dog.name}`}
            onPress={() => router.push('/(tabs)/rocky')}
            style={styles.dogCard}
          >
            <DogAvatar size={72} photoUri={dog.photoUri} dogName={dog.name} />
            <View style={styles.dogCardBody}>
              <Text style={styles.dogName}>{dog.name}</Text>
              {ageLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons name="gift-outline" size={14} color={colors.primaryBright} />
                  <Text style={styles.metaText}>{ageLabel}</Text>
                </View>
              ) : null}
              {dog.breedLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons name="paw-outline" size={14} color={colors.primaryBright} />
                  <Text style={styles.metaText}>{dog.breedLabel}</Text>
                </View>
              ) : null}
              {genderLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons
                    name={dog.sex === 'FEMALE' ? 'female' : 'male'}
                    size={14}
                    color={colors.primaryBright}
                  />
                  <Text style={styles.metaText}>{genderLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.seeProfile}>Vedi profilo</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Analizza un momento di ${dog.name}: video o audio`}
            onPress={openAnalyze}
            disabled={!dog.id || loading}
            style={({ pressed }) => [
              styles.analyzeBanner,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.analyzeIcon}>
              <Ionicons name="videocam" size={20} color={colors.primary} />
            </View>
            <View style={styles.analyzeCopy}>
              <Text style={styles.analyzeTitle}>Analizza un momento</Text>
              <Text style={styles.analyzeSubtitle}>Video o audio</Text>
            </View>
            <View style={styles.analyzeTrail}>
              <Ionicons name="paw" size={18} color={colors.primary} />
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ultime analisi</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Vedi tutte le analisi nel diario"
              onPress={() => router.push('/(tabs)/diary')}
              hitSlop={8}
              style={styles.seeAll}
            >
              <Text style={styles.seeAllText}>Vedi tutte</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
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
                  onPress={() =>
                    router.push(`/behavior/result/${insight.eventId}`)
                  }
                />
              ))
            ) : (
              <View style={styles.emptyInsight}>
                <View style={styles.emptyPhoto}>
                  <Ionicons name="videocam-outline" size={28} color={colors.primary} />
                </View>
                <Text style={styles.insightTitle}>Ancora nessun momento</Text>
                <Text style={styles.insightTime}>
                  Analizza un momento per vedere qui le letture.
                </Text>
              </View>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Consiglio per ${dog.name}: ${tip.title}. Tocca per un altro.`}
            onPress={() => setTip(nextHomeTip(dog, tip.id))}
            style={({ pressed }) => [
              styles.adviceBanner,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.adviceIcon}>
              <Ionicons name="bulb-outline" size={22} color={colors.warning} />
            </View>
            <View style={styles.adviceCopy}>
              <Text style={styles.adviceTitle}>{tip.title}</Text>
              <Text style={styles.adviceBody}>{tip.body}</Text>
            </View>
          </Pressable>

          {nextCare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Prossimo appuntamento: ${nextCare.title}`}
              onPress={() => router.push(`/care/${nextCare.id}` as never)}
              style={({ pressed }) => [
                styles.careCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.careIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color={colors.warning}
                />
              </View>
              <View style={styles.careText}>
                <Text style={styles.careLabel}>
                  {relativeCareDate(nextCare.scheduledAt)}
                </Text>
                <Text style={styles.careTitle}>{nextCare.title}</Text>
                <Text style={styles.careDate}>
                  {formatCareDate(nextCare.scheduledAt, nextCare.allDay)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Controlla la digestione di ${dog.name}`}
            onPress={() => router.push('/digestive/capture')}
            style={styles.digestiveCta}
          >
            <View style={styles.secondaryIcon}>
              <Ionicons name="leaf-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.secondaryCopy}>
              <Text style={styles.digestiveCtaText}>Controlla la digestione</Text>
              <Text style={styles.digestiveCtaHint}>
                Osserva una nuova evacuazione
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </Pressable>

          {behaviorRemaining === null ||
          (!quotaExhausted && behaviorRemaining > 2) ? null : quotaExhausted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scopri il piano per continuare le analisi"
              onPress={() => router.push('/paywall')}
            >
              <Text style={styles.quotaExhausted}>
                Hai usato tutti i video disponibili questo mese. Scopri il
                piano per continuare.
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.quota}>
              {behaviorRemaining}{' '}
              {behaviorRemaining === 1
                ? 'video disponibile'
                : 'video disponibili'}{' '}
              questo mese
            </Text>
          )}
        </ScrollView>
        <AnalyzeMomentSheet
          visible={analyzeOpen}
          dogName={dog.name}
          onClose={() => setAnalyzeOpen(false)}
          onVideo={startVideo}
          onAudio={startAudio}
        />
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
      accessibilityLabel={`Apri l'analisi: ${insight.label}`}
      onPress={onPress}
      style={styles.insightCard}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.insightPhoto} />
      ) : (
        <View style={styles.emptyPhoto}>
          <Ionicons name="paw-outline" size={26} color={colors.primary} />
        </View>
      )}
      <Text style={styles.insightTitle} numberOfLines={2}>
        {insight.label}
      </Text>
      <Text style={styles.insightTime}>{insight.timestampLabel}</Text>
      <TonePill tone={insight.tone} />
    </Pressable>
  );
}

function TonePill({ tone }: { tone: InsightTone }) {
  const palette =
    tone === 'positive'
      ? { bg: colors.successSoft, fg: colors.success }
      : tone === 'watch'
        ? { bg: colors.warningSoft, fg: colors.warning }
        : { bg: colors.surfaceMuted, fg: colors.textSecondary };
  return (
    <View style={[styles.tonePill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.toneText, { color: palette.fg }]}>
        {insightToneLabel(tone)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 28,
    height: 21,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  greeting: {
    fontSize: 34,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    letterSpacing: -0.6,
  },
  tagline: {
    marginTop: 2,
    marginBottom: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  statusRetry: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  processingText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  dogCardBody: {
    flex: 1,
    marginLeft: spacing.md,
    gap: 3,
  },
  dogName: {
    fontSize: 20,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  seeProfile: {
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  analyzeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F6FF',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  analyzeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeCopy: {
    flex: 1,
  },
  analyzeTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  analyzeSubtitle: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  analyzeTrail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  insightRow: {
    gap: spacing.md,
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  insightCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...shadows.card,
  },
  insightPhoto: {
    width: '100%',
    height: 92,
    borderRadius: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  emptyInsight: {
    width: 168,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...shadows.card,
  },
  emptyPhoto: {
    width: '100%',
    height: 92,
    borderRadius: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: typography.weight.bold,
    color: colors.text,
    minHeight: 34,
  },
  insightTime: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
  },
  tonePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  toneText: {
    fontSize: 11,
    fontWeight: typography.weight.semibold,
  },
  adviceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#FFF6E5',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  adviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceCopy: {
    flex: 1,
  },
  adviceTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    lineHeight: 22,
  },
  adviceBody: {
    marginTop: 4,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.88,
  },
  quota: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  quotaExhausted: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  digestiveCta: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  secondaryIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  secondaryCopy: {
    flex: 1,
  },
  digestiveCtaText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  digestiveCtaHint: {
    marginTop: 2,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  careCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warningSoft,
    backgroundColor: colors.surface,
  },
  careIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
  },
  careText: {
    flex: 1,
  },
  careLabel: {
    color: colors.warning,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  careTitle: {
    marginTop: spacing.xxs,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  careDate: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
});

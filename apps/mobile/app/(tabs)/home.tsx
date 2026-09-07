/**
 * Tab Home — accesso rapido a storie, analisi e diario.
 * Contenuti: header, storie, dog card,
 * CTA dominante gradiente "SCOPRI I SEGNALI DI ROCKY",
 * "Controlla digestione" secondario, ultima analisi, quota residua sottile.
 * Stati obbligatori (sez. 6): new user (cold-start), quota exhausted,
 * offline (banner con retry su network monitor reale; demoFlags.homeOffline
 * forza la demo in dev), processing existing event.
 * Dati reali via useHomeData (GET /v1/usage + GET /v1/diary); mock solo in
 * mock gate dev.
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card, CuteIcon } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { diaryEntriesMock } from '@/mocks/core';
import { demoFlags } from '@/mocks/demo';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StoriesRail } from '@/features/stories/StoriesRail';
import { useStories } from '@/features/stories/data';
import {
  currentAgeLabel,
  isBirthdayToday,
} from '@/features/dogs/profileDates';
import {
  formatCareDate,
  relativeCareDate,
} from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const stories = useStories();
  const birthdayToday = isBirthdayToday(dog.birthDate);
  const {
    usage,
    lastInsight,
    processingEventId,
    source,
    loading,
    error,
    refetch,
  } = useHomeData(dog.id);

  // Stato offline (sez. 6 Home): network monitor reale (expo-network);
  // demoFlags.homeOffline resta solo per forzare la demo in dev.
  const network = useNetworkStatus();
  const offline = demoFlags.homeOffline || network.offline;

  const behaviorRemaining = usage
    ? usage.behaviorLimit - usage.behaviorUsed
    : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;
  // Prossimo evento agenda: solo futuri non completati (store.nextCareEvent);
  // useCareEvents idrata lo store e rende reattiva la card.
  useCareEvents(dog.id);
  const nextCare = nextCareEvent(dog.id);
  const dogMeta = [
    currentAgeLabel(dog.birthDate, dog.ageLabel),
    dog.breedLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  const startCapture = () => {
    if (!dog.id || loading) return;
    if (processingEventId) {
      router.push(`/behavior/processing/${processingEventId}`);
      return;
    }
    if (quotaExhausted) {
      // Paywall mai prima del primo valore (sez. 21.2): qui il valore c'è già
      router.push('/paywall');
      return;
    }
    router.push('/behavior/capture');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: logo + saluto + campana con badge (mockup + brand) */}
          <View style={styles.headerRow}>
            <View style={styles.logoBadge}>
              <Image
                source={logoMarkSource}
                style={styles.logoMark}
                resizeMode="contain"
                accessibilityLabel="Dogly"
              />
            </View>
            <View style={styles.headerText}>
              <Text
                style={styles.greeting}
                accessibilityLabel={
                  birthdayToday
                    ? `Buon compleanno, ${dog.name}!`
                    : 'Ciao!'
                }
              >
                {birthdayToday
                  ? `Buon compleanno, ${dog.name}! 🎉`
                  : 'Ciao!'}
              </Text>
              <Text style={styles.tagline}>Sempre al fianco di {dog.name}</Text>
            </View>
            <View style={styles.headerActions}>
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
                <Ionicons name="notifications-outline" size={24} color={colors.text} />
                {nextCare ? <View style={styles.badge} /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Apri il profilo di ${dog.name}`}
                onPress={() => router.push('/(tabs)/rocky')}
                hitSlop={8}
              >
                <DogAvatar size={38} photoUri={dog.photoUri} dogName={dog.name} />
              </Pressable>
            </View>
          </View>

          <StoriesRail
            stories={stories}
            onAdd={() => router.push('/(tabs)/camera')}
            onOpen={(story) => router.push(`/stories/${story.id}` as never)}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri il profilo di ${dog.name}`}
            onPress={() => router.push('/(tabs)/rocky')}
            style={styles.dogHero}
          >
            {dog.photoUri ? (
              <ImageBackground
                source={{ uri: dog.photoUri }}
                style={styles.dogHeroImage}
                imageStyle={styles.dogHeroImageRadius}
                resizeMode="cover"
              >
                <View style={styles.dogHeroOverlay}>
                  <Text style={styles.dogHeroName}>{dog.name}</Text>
                  <Text style={styles.dogHeroMeta}>{dogMeta}</Text>
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.dogHeroFallback}>
                <DogAvatar size={104} photoUri={null} dogName={dog.name} />
                <View style={styles.dogHeroFallbackText}>
                  <Text style={styles.dogName}>{dog.name}</Text>
                  <Text style={styles.fallbackMeta}>{dogMeta}</Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Stato offline (sez. 6 Home): banner con retry, pattern come
              digestive/capture ("upload failure") — icona cloud-offline */}
          {offline && (
            <View
              style={styles.offlineBanner}
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name="cloud-offline-outline"
                size={18}
                color={colors.danger}
              />
              <Text style={styles.offlineText}>
                Sei offline: ti mostro gli ultimi dati disponibili. Le nuove
                analisi richiedono connessione.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => {
                  if (demoFlags.homeOffline) return; // demo forzata in dev
                  void network.refresh();
                }}
                hitSlop={8}
              >
                <Text style={styles.offlineRetry}>Riprova</Text>
              </Pressable>
            </View>
          )}

          {loading && !offline ? (
            <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.offlineText}>
                Sto caricando i dati di {dog.name}.
              </Text>
            </View>
          ) : null}

          {error && !offline ? (
            <View style={styles.offlineBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.offlineText}>
                Non sono riuscito a caricare quota e analisi.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare i dati"
                onPress={refetch}
                hitSlop={8}
              >
                <Text style={styles.offlineRetry}>Riprova</Text>
              </Pressable>
            </View>
          ) : null}

          {/* CTA dominante: osservazione video dei segnali */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Scopri i segnali di ${dog.name}: registra un momento`}
            onPress={startCapture}
            disabled={!dog.id || loading}
          >
            <LinearGradient
              colors={[...gradients.cta]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <View style={styles.ctaIcon}>
                <Ionicons name="videocam" size={26} color={colors.textOnPrimary} />
              </View>
              <View style={styles.ctaCopy}>
                <Text style={styles.ctaTitle}>
                  SCOPRI I SEGNALI DI {dog.name.toUpperCase()}
                </Text>
                <Text style={styles.ctaSubtitle}>
                  Registra un momento
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={21}
                color={colors.textOnPrimary}
              />
            </LinearGradient>
          </Pressable>

          {lastInsight && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'ultima analisi: ${lastInsight.label}`}
              onPress={() => {
                if (source === 'api') {
                  router.push(`/behavior/result/${lastInsight.eventId}`);
                  return;
                }
                const entry = diaryEntriesMock.find(
                  (item) => item.refId === lastInsight.eventId,
                );
                if (entry) router.push(`/diary/event/${entry.id}`);
              }}
            >
              <Card style={styles.lastInsight}>
                <View style={styles.lastInsightIcon}>
                  <Ionicons name="happy-outline" size={22} color={colors.accent} />
                </View>
                <View style={styles.lastInsightText}>
                  <Text style={styles.lastInsightLabel}>Ultima analisi</Text>
                  <Text style={styles.lastInsightValue}>{lastInsight.label}</Text>
                  <Text style={styles.lastInsightTime}>
                    {lastInsight.timestampLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Card>
            </Pressable>
          )}

          {processingEventId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'analisi in corso di ${dog.name}`}
              onPress={() => router.push(`/behavior/processing/${processingEventId}`)}
              style={styles.processingBanner}
            >
              <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
              <Text style={styles.processingText}>
                Un'analisi è in corso: ti avviso quando è pronta
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dimmi qualcosa di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
            style={({ pressed }) => [
              styles.tellCard,
              pressed && styles.tellCardPressed,
            ]}
          >
            <View style={styles.tellIcon}>
              <CuteIcon name="voice" size={25} color={colors.primary} />
            </View>
            <View style={styles.tellCopy}>
              <Text style={styles.tellEyebrow}>UNA COSA IMPORTANTE</Text>
              <Text style={styles.tellTitle}>Dimmi qualcosa di {dog.name}</Text>
              <Text style={styles.tellHint}>Parla oppure scrivi</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.primary} />
          </Pressable>

          {/* Capacità secondaria: digestione (UX LOCK: non una tab) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Controlla la digestione di ${dog.name}`}
            onPress={() => router.push('/digestive/capture')}
            style={styles.digestiveCta}
          >
            <View style={styles.secondaryIcon}>
              <Ionicons name="leaf-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.secondaryCopy}>
              <Text style={styles.digestiveCtaText}>Controlla la digestione</Text>
              <Text style={styles.digestiveCtaHint}>
                Osserva una nuova evacuazione
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </Pressable>

          {nextCare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Prossimo appuntamento: ${nextCare.title}`}
              onPress={() => router.push(`/care/${nextCare.id}` as never)}
              style={({ pressed }) => [
                styles.careCard,
                pressed && styles.careCardPressed,
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

          {behaviorRemaining === null ||
          (!quotaExhausted && behaviorRemaining > 2) ? null : quotaExhausted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scopri il piano per continuare le analisi"
              onPress={() => router.push('/paywall')}
            >
              <Text style={styles.quotaExhausted}>
                Analisi comportamentali esaurite per questo mese. Scopri il piano
                per continuare.
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.quota}>
              {behaviorRemaining}{' '}
              {behaviorRemaining === 1
                ? 'analisi comportamentale rimasta'
                : 'analisi comportamentali rimaste'}{' '}
              questo mese
            </Text>
          )}

        </ScrollView>
      </SafeAreaView>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.card,
  },
  logoMark: {
    width: 34,
    height: 25, // ratio 132:97 dell'asset brand
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  tagline: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerIcon: {
    minWidth: 36,
    minHeight: 36,
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
  dogHero: {
    minHeight: 220,
    overflow: 'hidden',
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  dogHeroImage: {
    height: 220,
    justifyContent: 'flex-end',
  },
  dogHeroImageRadius: {
    borderRadius: radius.lg,
  },
  dogHeroOverlay: {
    padding: spacing.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    backgroundColor: colors.overlayDark,
  },
  dogHeroName: {
    color: colors.textOnPrimary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
  },
  dogHeroMeta: {
    marginTop: spacing.xs,
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
  },
  dogHeroFallback: {
    minHeight: 220,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  dogHeroFallbackText: {
    flex: 1,
  },
  dogName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  fallbackMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  offlineText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  offlineRetry: {
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
    marginBottom: spacing.lg,
  },
  processingText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  cta: {
    minHeight: 88,
    flexDirection: 'row',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.raised,
  },
  ctaIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayLight,
  },
  ctaCopy: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  ctaSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
  quota: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  quotaExhausted: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  tellCard: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  tellCardPressed: {
    opacity: 0.78,
  },
  tellIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tellCopy: {
    flex: 1,
  },
  tellEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
  },
  tellTitle: {
    marginTop: 2,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  tellHint: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  digestiveCta: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  secondaryIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  secondaryCopy: {
    flex: 1,
  },
  digestiveCtaText: {
    fontSize: typography.size.md,
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
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warningSoft,
    backgroundColor: colors.surface,
  },
  careCardPressed: {
    backgroundColor: colors.surfaceMuted,
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
  lastInsight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  lastInsightIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastInsightText: {
    flex: 1,
  },
  lastInsightLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  lastInsightValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  lastInsightTime: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
});

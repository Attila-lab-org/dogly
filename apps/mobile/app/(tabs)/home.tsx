/**
 * Tab Home — accesso rapido a storie, analisi e diario.
 * Contenuti: header, storie, dog card,
 * CTA dominante gradiente "CAPISCI ROCKY" (mic + videocamera),
 * "Controlla digestione" secondario, ultima analisi, quota residua sottile.
 * Stati obbligatori (sez. 6): new user (cold-start), quota exhausted,
 * offline (banner con retry su network monitor reale; demoFlags.homeOffline
 * forza la demo in dev), processing existing event.
 * Dati reali via useHomeData (GET /v1/usage + GET /v1/diary); mock solo in
 * mock gate dev.
 */
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card, DogMetaRow } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { diaryEntriesMock } from '@/mocks/core';
import { demoFlags } from '@/mocks/demo';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { WelcomeCheckInModal } from '@/features/checkin/WelcomeCheckInModal';
import { useCheckIn } from '@/features/checkin/store';
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
  const { usage, lastInsight, processingEventId, isNewUser, source } =
    useHomeData(dog.id);
  const { analysisContext } = useCheckIn();

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

  const startCapture = () => {
    if (processingEventId) {
      router.push(`/behavior/processing/${processingEventId}`);
      return;
    }
    if (quotaExhausted) {
      // Paywall mai prima del primo valore (sez. 21.2): qui il valore c'è già
      router.push('/paywall');
      return;
    }
    // Contesto check-in ("Sembra sereno" / "Non come al solito"): il capture
    // mostra la nota coerente quando arriva con from=checkin.
    router.push(
      (analysisContext
        ? '/behavior/capture?from=checkin'
        : '/behavior/capture') as never,
    );
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
              <Text style={styles.tagline}>Il tuo cane, finalmente capito.</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apri diario"
                onPress={() => router.push('/(tabs)/diary')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="calendar-outline" size={23} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifiche, non lette"
                onPress={() => router.push('/notifications')}
                hitSlop={12}
                style={styles.headerIcon}
              >
                <Ionicons name="notifications-outline" size={24} color={colors.text} />
                {nextCare ? <View style={styles.badge} /> : null}
              </Pressable>
            </View>
          </View>

          <StoriesRail
            stories={stories}
            onAdd={() => router.push('/(tabs)/camera')}
            onOpen={(story) => router.push(`/stories/${story.id}` as never)}
          />

          {/* Dog card: foto circolare, nome, cuore, meta con icone teal */}
          <Card style={styles.dogCard}>
            <View style={styles.dogRow}>
              <DogAvatar size={104} photoUri={dog.photoUri} dogName={dog.name} />
              <View style={styles.dogInfo}>
                <View style={styles.dogNameRow}>
                  <Text style={styles.dogName}>{dog.name}</Text>
                  <Ionicons name="heart-outline" size={22} color={colors.danger} />
                </View>
                <DogMetaRow
                  ageLabel={currentAgeLabel(dog.birthDate, dog.ageLabel)}
                  sizeLabel={dog.sizeLabel}
                  breedLabel={dog.breedLabel}
                />
              </View>
            </View>

          </Card>

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

          {/* Cold-start copy (sez. 7.1.3): valore immediato, migliora nel tempo */}
          {isNewUser && (
            <Card style={styles.coldStart}>
              <Text style={styles.coldStartText}>
                So già interpretare i segnali più comuni di {dog.name} e ti
                conoscerò sempre meglio, analisi dopo analisi.
              </Text>
            </Card>
          )}

          {/* Evento in lavorazione (sez. 6: "processing existing event") */}
          {processingEventId && (
            <Pressable
              accessibilityRole="button"
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

          {/* CTA dominante: card gradiente blu "CAPISCI ROCKY" */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Capisci ${dog.name}: registra un video`}
            onPress={startCapture}
            disabled={false}
          >
            <LinearGradient
              colors={[...gradients.cta]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaTitle}>CAPISCI {dog.name.toUpperCase()}</Text>
              <Text style={styles.ctaSubtitle}>
                Registra un breve video
              </Text>
              <View style={styles.ctaCircle}>
                <Ionicons name="videocam" size={30} color={colors.accent} />
              </View>
            </LinearGradient>
          </Pressable>

          {/* Quota residua sottile (sez. 21) o CTA paywall se esaurita.
              Con API attiva ma quota non caricata: niente numeri inventati. */}
          {behaviorRemaining === null ? null : quotaExhausted ? (
            <Pressable
              accessibilityRole="button"
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

          {/* Capacità secondaria: digestione (UX LOCK: non una tab) */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/digestive/capture')}
            style={styles.digestiveCta}
          >
            <Ionicons name="leaf-outline" size={18} color={colors.accent} />
            <Text style={styles.digestiveCtaText}>Controlla digestione</Text>
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

          {/* Ultima analisi (mockup: smiley teal + chevron) */}
          {lastInsight && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (source === 'api') {
                  // Dati reali: dettaglio evento dal backend
                  router.push(`/behavior/result/${lastInsight.eventId}`);
                  return;
                }
                // Mock gate: lastInsight.eventId → episodio del Diario
                // che referenzia quell'evento (niente id hardcoded).
                const entry = diaryEntriesMock.find(
                  (e) => e.refId === lastInsight.eventId,
                );
                if (entry) {
                  router.push(`/diary/event/${entry.id}`);
                }
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
        </ScrollView>
      </SafeAreaView>
      <WelcomeCheckInModal dogName={dog.name} />
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
  dogCard: {
    marginBottom: spacing.lg,
  },
  dogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  dogInfo: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  dogNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dogName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
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
  coldStart: {
    marginBottom: spacing.lg,
    backgroundColor: colors.accentSoft,
  },
  coldStartText: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
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
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.raised,
  },
  ctaTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textOnPrimary,
    letterSpacing: 1,
  },
  ctaSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
  ctaCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
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
  digestiveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  digestiveCtaText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
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

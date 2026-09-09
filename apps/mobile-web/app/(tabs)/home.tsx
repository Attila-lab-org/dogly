/**
 * Tab Home — versione web (apps/mobile-web).
 * Layout allineato al mockup ufficiale:
 *  - Header: saluto "Ciao! 👋" + tagline + campana con badge
 *  - Dog card: avatar circolare, nome + cuore, dettagli (età/taglia/razza)
 *  - CTA dominante gradiente "CAPISCI ROCKY" con due pulsanti (mic + video)
 *  - Riga "Ultima analisi"
 * Rimossa rispetto al mockup: la sezione "Quanto conosco Rocky" (progress),
 * per esplicita richiesta.
 */
import React from 'react';
import {
  ActivityIndicator,
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
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { demoFlags } from '@/mocks/demo';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { currentAgeLabel, isBirthdayToday } from '@/features/dogs/profileDates';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { CheckInModal } from '@/features/checkin/CheckInModal';
import { useSession } from '@/features/auth/SessionProvider';

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
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

  const network = useNetworkStatus();
  const offline = demoFlags.homeOffline || network.offline;

  const behaviorRemaining = usage ? usage.behaviorLimit - usage.behaviorUsed : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;

  const ageLabel = currentAgeLabel(dog.birthDate, dog.ageLabel);
  const sizeLabel = dog.sizeLabel || 'Taglia media';
  const breedLabel = dog.breedLabel || 'Cane';

  const startVideoCapture = () => {
    if (!dog.id || loading) return;
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

  const startAudioTell = () => {
    if (!dog.id) return;
    router.push(`/dogs/${dog.id}/tell` as never);
  };

  const openLastInsight = () => {
    if (!lastInsight) return;
    if (source === 'api') {
      router.push(`/behavior/result/${lastInsight.eventId}`);
      return;
    }
    router.push(`/diary/event/${lastInsight.eventId}`);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text
                style={styles.greeting}
                accessibilityLabel={birthdayToday ? `Buon compleanno, ${dog.name}!` : 'Ciao!'}
              >
                {birthdayToday ? `Buon compleanno, ${dog.name}! 🎉` : 'Ciao! 👋'}
              </Text>
              <Text style={styles.tagline}>Pronto a capire meglio {dog.name}?</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifiche"
              onPress={() => router.push('/notifications')}
              hitSlop={12}
              style={styles.bellButton}
            >
              <Ionicons name="notifications-outline" size={26} color={colors.text} />
              <View style={styles.bellBadge} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri il profilo di ${dog.name}`}
            onPress={() => router.push('/(tabs)/rocky')}
            style={styles.dogCard}
          >
            <DogAvatar size={72} photoUri={dog.photoUri} dogName={dog.name} />
            <View style={styles.dogCardBody}>
              <View style={styles.dogNameRow}>
                <Text style={styles.dogName}>{dog.name}</Text>
                <Ionicons name="heart-outline" size={20} color={colors.danger} />
              </View>
              <View style={styles.dogMetaList}>
                <View style={styles.dogMetaRow}>
                  <Ionicons name="today-outline" size={15} color={colors.accent} />
                  <Text style={styles.dogMetaText}>{ageLabel}</Text>
                </View>
                <View style={styles.dogMetaRow}>
                  <Ionicons name="resize-outline" size={15} color={colors.accent} />
                  <Text style={styles.dogMetaText}>{sizeLabel}</Text>
                </View>
                <View style={styles.dogMetaRow}>
                  <Ionicons name="paw-outline" size={15} color={colors.accent} />
                  <Text style={styles.dogMetaText}>{breedLabel}</Text>
                </View>
              </View>
            </View>
          </Pressable>

          {offline && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
              <Text style={styles.statusText}>Sei offline: ti mostro gli ultimi dati disponibili.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => { if (!demoFlags.homeOffline) void network.refresh(); }}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          )}

          {loading && !offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Sto caricando i dati di {dog.name}.</Text>
            </View>
          ) : null}

          {error && !offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.statusText}>Non sono riuscito a caricare quota e analisi.</Text>
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

          {processingEventId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'analisi in corso di ${dog.name}`}
              onPress={() => router.push(`/behavior/processing/${processingEventId}`)}
              style={styles.processingBanner}
            >
              <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
              <Text style={styles.processingText}>Un'analisi è in corso: ti avviso quando è pronta</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          )}

          <View style={styles.ctaWrap}>
            <LinearGradient
              colors={[...gradients.cta]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaTitle}>CAPISCI {dog.name.toUpperCase()}</Text>
              <Text style={styles.ctaSubtitle}>Premi e analizza audio + video</Text>
              <View style={styles.ctaButtons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Registra audio per raccontarmi di ${dog.name}`}
                  onPress={startAudioTell}
                  style={styles.ctaCircle}
                >
                  <Ionicons name="mic" size={28} color={colors.success} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Registra un video di ${dog.name}`}
                  onPress={startVideoCapture}
                  disabled={!dog.id || loading}
                  style={styles.ctaCircle}
                >
                  <Ionicons name="videocam" size={28} color={colors.primary} />
                </Pressable>
              </View>
            </LinearGradient>
          </View>

          {lastInsight && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'ultima analisi: ${lastInsight.label}`}
              onPress={openLastInsight}
              style={styles.lastInsightRow}
            >
              <View style={styles.lastInsightIcon}>
                <Ionicons name="happy-outline" size={22} color={colors.success} />
              </View>
              <View style={styles.lastInsightText}>
                <Text style={styles.lastInsightLabel}>Ultima analisi</Text>
                <Text style={styles.lastInsightValue}>{lastInsight.label}</Text>
                <Text style={styles.lastInsightTime}>{lastInsight.timestampLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
      <CheckInModal dogId={dog.id} dogName={dog.name} mockGate={usingMockGate} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    padding: spacing.lg, paddingBottom: spacing.xxxl,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerText: { flex: 1 },
  greeting: {
    fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: colors.text,
  },
  tagline: { marginTop: spacing.xs, fontSize: typography.size.sm, color: colors.textSecondary },
  bellButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.surface,
  },
  dogCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    padding: spacing.lg, backgroundColor: colors.surface,
    borderRadius: radius.lg, marginBottom: spacing.lg, ...shadows.card,
  },
  dogCardBody: { flex: 1 },
  dogNameRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dogName: {
    fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text,
  },
  dogMetaList: { gap: spacing.xs },
  dogMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dogMetaText: { fontSize: typography.size.sm, color: colors.textSecondary },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dangerSoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  statusText: {
    flex: 1, fontSize: typography.size.xs, color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.normal,
  },
  statusRetry: {
    fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.primary,
  },
  processingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primarySoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  processingText: {
    flex: 1, fontSize: typography.size.xs, color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  ctaWrap: { marginBottom: spacing.lg, ...shadows.raised },
  cta: {
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: 'center', gap: spacing.sm,
  },
  ctaTitle: {
    fontSize: typography.size.xxl, fontWeight: typography.weight.bold,
    color: colors.textOnPrimary, letterSpacing: 0.5,
  },
  ctaSubtitle: {
    fontSize: typography.size.sm, color: colors.textOnPrimary, opacity: 0.9,
  },
  ctaButtons: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg },
  ctaCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    ...shadows.card,
  },
  lastInsightRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, ...shadows.card,
  },
  lastInsightIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.successSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  lastInsightText: { flex: 1 },
  lastInsightLabel: { fontSize: typography.size.xs, color: colors.textMuted },
  lastInsightValue: {
    fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text,
  },
  lastInsightTime: { fontSize: typography.size.xs, color: colors.textSecondary },
});

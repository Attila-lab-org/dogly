/**
 * Tab Home (Spec V1 sez. 5.1) — replica fedele di docs/ux/mockup-home.png.
 * Contenuti: header "Ciao! 👋", dog card, Knowledge Score (38%),
 * CTA dominante gradiente "CAPISCI ROCKY" (mic + videocamera),
 * "Controlla digestione" secondario, ultima analisi, quota residua sottile.
 * Stati obbligatori (sez. 6): new user (cold-start), quota exhausted,
 * offline (banner con retry, mock flag demoFlags.homeOffline),
 * processing existing event.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { diaryEntriesMock, homeDataMock } from '@/mocks/core';
import { demoFlags } from '@/mocks/demo';
import { DogAvatar, KnowledgeScoreBlock } from '@/features/core/components';

export default function HomeScreen() {
  const router = useRouter();
  const { dog, knowledgeScore, usage, lastInsight, processingEventId, isNewUser } =
    homeDataMock;

  // Stato offline (sez. 6 Home): simulato dal flag demo finché non c'è un
  // network monitor; il retry ricontrolla la connettività (mock: torna online).
  const [offline, setOffline] = useState(demoFlags.homeOffline);

  const behaviorRemaining = usage.behaviorLimit - usage.behaviorUsed;
  const quotaExhausted = behaviorRemaining <= 0;

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
    router.push('/behavior/capture');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: saluto + campana con badge (mockup) */}
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.greeting}>Ciao! 👋</Text>
              <Text style={styles.subtitle}>
                Pronto a capire meglio {dog.name}?
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifiche"
              onPress={() => router.push('/notifications')}
              hitSlop={12}
              style={styles.bell}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
              <View style={styles.badge} />
            </Pressable>
          </View>

          {/* Dog card: foto circolare, nome, cuore, meta con icone teal */}
          <Card style={styles.dogCard}>
            <View style={styles.dogRow}>
              <DogAvatar size={104} photoUri={dog.photoUri} />
              <View style={styles.dogInfo}>
                <View style={styles.dogNameRow}>
                  <Text style={styles.dogName}>{dog.name}</Text>
                  <Ionicons name="heart-outline" size={22} color={colors.danger} />
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar" size={15} color={colors.accent} />
                  <Text style={styles.metaText}>{dog.ageLabel}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="resize" size={15} color={colors.accent} />
                  <Text style={styles.metaText}>{dog.sizeLabel}</Text>
                </View>
                {dog.breedLabel ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="paw" size={15} color={colors.accent} />
                    <Text style={styles.metaText}>{dog.breedLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Knowledge Score dentro la dog card (mockup) */}
            <KnowledgeScoreBlock
              knowledgeScore={knowledgeScore}
              dogName={dog.name}
              style={styles.score}
            />
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
                onPress={() => setOffline(false)}
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
                Premi e analizza audio + video
              </Text>
              <View style={styles.ctaButtons}>
                <View style={styles.ctaCircle}>
                  <Ionicons name="mic" size={30} color={colors.accent} />
                </View>
                <View style={styles.ctaDivider} />
                <View style={styles.ctaCircle}>
                  <Ionicons name="videocam" size={30} color={colors.accent} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Quota residua sottile (sez. 21) o CTA paywall se esaurita */}
          {quotaExhausted ? (
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

          {/* Ultima analisi (mockup: smiley teal + chevron) */}
          {lastInsight && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                // Route dal mock: lastInsight.eventId → episodio del Diario
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  bell: {
    padding: spacing.xs,
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
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  score: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  ctaButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xl,
  },
  ctaCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDivider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
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

/**
 * Tab Rocky (Spec V1 sez. 5.1) — replica fedele di docs/ux/mockup-rocky.png.
 * Contenuti: identità, Knowledge Score, pattern appresi, stati frequenti,
 * baseline digestiva + cibo attivo, drill-down settings.
 * Stati obbligatori (sez. 6): low knowledge, no pattern, contested pattern
 * (badge "Da verificare").
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ProgressBar } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import {
  digestiveBaselineMock,
  DOG_ID,
  feedingPeriodsMock,
  foodProductsMock,
  knowledgeScoreMock,
  patternsMock,
} from '@/mocks/secondary';
import { PatternStateChip, SectionHeader } from '@/features/secondary/components';

const DOG = {
  name: 'Rocky',
  age: '4 anni',
  size: 'Taglia media',
  breed: 'Labrador',
};

const FREQUENT_STATES: { label: string; tone: 'success' | 'primary' | 'warning' }[] = [
  { label: 'Relax', tone: 'success' },
  { label: 'Gioco', tone: 'primary' },
  { label: 'Attenzione', tone: 'warning' },
];

const PATTERN_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'pattern-porta': 'log-in',
  'pattern-sera': 'moon',
  'pattern-fattorino': 'megaphone',
};

export default function RockyScreen() {
  const router = useRouter();

  const score = knowledgeScoreMock.score;
  const isLowKnowledge = score < 30;

  // Pattern visibili: mai ARCHIVED; CONTESTED con badge "Da verificare"
  const visiblePatterns = patternsMock.filter((p) => p.state !== 'ARCHIVED');
  const hasPatterns = visiblePatterns.length > 0;

  const activePeriod = feedingPeriodsMock.find((f) => f.endedAt === null);
  const activeFood = activePeriod
    ? foodProductsMock.find((f) => f.id === activePeriod.foodProductId)
    : undefined;
  const baseline = digestiveBaselineMock;

  return (
    <View style={styles.root}>
      {/* Header gradiente blu con foto circolare + matita + ingranaggio */}
      <LinearGradient
        colors={[...gradients.header]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Impostazioni"
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={styles.gear}
          >
            <Ionicons name="settings-outline" size={24} color={colors.textOnPrimary} />
          </Pressable>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Ionicons name="paw" size={52} color={colors.textMuted} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modifica foto di Rocky"
              style={styles.editBadge}
            >
              <Ionicons name="pencil" size={14} color={colors.primary} />
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Identità */}
        <Text style={styles.name}>{DOG.name}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{DOG.age}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="resize-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{DOG.size}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="paw-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{DOG.breed}</Text>
          </View>
        </View>

        {/* Knowledge Score (sez. 18 — product score, numero ammesso) */}
        <Card style={styles.section}>
          <View style={styles.scoreRow}>
            <Text style={styles.sectionTitle}>Quanto conosco {DOG.name}</Text>
            <Text style={styles.scoreValue}>{score}%</Text>
          </View>
          <ProgressBar progress={score / 100} tone="primary" />
          <Text style={styles.caption}>
            {isLowKnowledge
              ? knowledgeScoreMock.captionLow
              : knowledgeScoreMock.caption}
          </Text>
        </Card>

        {/* Pattern appresi (sez. 17.2) */}
        <Card style={styles.section}>
          <SectionHeader
            title="Pattern appresi"
            icon={<Ionicons name="bulb" size={20} color="#F5C518" />}
          />
          {hasPatterns ? (
            visiblePatterns.map((pattern, index) => (
              <Pressable
                key={pattern.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/patterns/${pattern.id}`)
                }
                style={[
                  styles.patternRow,
                  index < visiblePatterns.length - 1 && styles.patternRowDivider,
                ]}
              >
                <View style={styles.patternIconWrap}>
                  <Ionicons
                    name={PATTERN_ICONS[pattern.id] ?? 'sparkles'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.patternTextWrap}>
                  <Text style={styles.patternTitle}>{pattern.title}</Text>
                  {pattern.state === 'CONTESTED' && (
                    <PatternStateChip state={pattern.state} />
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyPatterns}>
              <Text style={styles.emptyPatternsText}>
                Non ho ancora imparato pattern di {DOG.name}. Continua ad
                analizzare: li scopriremo insieme.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/patterns')}
              >
                <Text style={styles.link}>Scopri come funziona</Text>
              </Pressable>
            </View>
          )}
          {hasPatterns && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/patterns')}
              style={styles.seeAll}
            >
              <Text style={styles.link}>Vedi tutti i pattern</Text>
            </Pressable>
          )}
        </Card>

        {/* Stati frequenti — chip colorate come da mockup */}
        <Card style={styles.section}>
          <SectionHeader title="Stati frequenti" />
          <View style={styles.chipsRow}>
            {FREQUENT_STATES.map((s) => (
              <Chip key={s.label} label={s.label} tone={s.tone} />
            ))}
          </View>
        </Card>

        {/* Digestione: baseline + cibo attivo + link alla capacità secondaria */}
        <Card style={styles.section}>
          <SectionHeader
            title="Digestione"
            icon={<Ionicons name="leaf-outline" size={18} color={colors.accent} />}
          />
          <View style={styles.digestiveRow}>
            <Ionicons name="analytics-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.digestiveText}>
              Baseline: {baseline.trendSummary.toLowerCase()} ·{' '}
              {baseline.observedEvents} osservazioni
            </Text>
          </View>
          {activeFood ? (
            <View style={styles.digestiveRow}>
              <Ionicons name="nutrition-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.digestiveText}>
                Cibo attivo: {activeFood.brand} {activeFood.name}
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/nutrition/foods')}
              style={styles.digestiveRow}
            >
              <Ionicons name="nutrition-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.link}>Aggiungi il cibo di Rocky</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/digestive/capture')}
            style={styles.digestiveCta}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.link}>Controlla digestione</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 128;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    borderBottomLeftRadius: radius.lg * 2,
    borderBottomRightRadius: radius.lg * 2,
  },
  headerSafe: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  gear: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
  },
  avatarWrap: {
    marginTop: spacing.xl,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.textOnPrimary,
    ...shadows.raised,
  },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  name: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  scoreValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.accent,
  },
  caption: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  patternRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  patternIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternTextWrap: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  patternTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  emptyPatterns: {
    gap: spacing.sm,
  },
  emptyPatternsText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  seeAll: {
    marginTop: spacing.md,
  },
  link: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  digestiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  digestiveText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  digestiveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});

// Esportato per test futuri: il dogId mock usato dalla schermata
export { DOG_ID };

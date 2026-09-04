/**
 * Abbonamento (Spec V1 sez. 21): piano corrente, quote d'uso dal ledger
 * (behavior x/3, digestive x/3 — NO unlimited), rinnovo, ripristina acquisto.
 * GET /v1/subscription/status + GET /v1/usage.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, ProgressBar, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { subscriptionMock } from '@/mocks/secondary';

const PLAN_LABELS = {
  FREE: 'Free',
  PREMIUM_MONTHLY: 'Premium mensile',
  PREMIUM_ANNUAL: 'Premium annuale',
} as const;

export default function SubscriptionScreen() {
  const router = useRouter();
  const { plan, renewsAt, usage } = subscriptionMock;
  const isPremium = plan !== 'FREE';

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Abbonamento" />

      {/* Piano corrente */}
      <Card style={styles.card}>
        <View style={styles.planHeader}>
          <View>
            <Text style={styles.planLabel}>Piano attuale</Text>
            <Text style={styles.planName}>{PLAN_LABELS[plan]}</Text>
          </View>
          <Chip
            label={isPremium ? 'Attivo' : 'Gratuito'}
            tone={isPremium ? 'accent' : 'neutral'}
          />
        </View>
        <Text style={styles.renewal}>
          {isPremium && renewsAt
            ? `Si rinnova il ${new Date(renewsAt).toLocaleDateString('it-IT')}`
            : 'Nessun rinnovo: il piano Free non ha costi.'}
        </Text>
      </Card>

      {/* Quote d'uso (usage ledger server-side, sez. 21.1) */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Utilizzo di questo mese</Text>

        <View style={styles.quotaHeader}>
          <View style={styles.quotaTitleRow}>
            <Ionicons name="videocam-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.quotaTitle}>Analisi comportamentali</Text>
          </View>
          <Text style={styles.quotaValue}>
            {usage.behaviorUsed}/{usage.behaviorLimit}
          </Text>
        </View>
        <ProgressBar
          progress={usage.behaviorUsed / usage.behaviorLimit}
          tone="primary"
        />

        <View style={[styles.quotaHeader, styles.quotaGap]}>
          <View style={styles.quotaTitleRow}>
            <Ionicons name="camera-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.quotaTitle}>Analisi digestive</Text>
          </View>
          <Text style={styles.quotaValue}>
            {usage.digestiveUsed}/{usage.digestiveLimit}
          </Text>
        </View>
        <ProgressBar
          progress={usage.digestiveUsed / usage.digestiveLimit}
          tone="accent"
        />

        <Text style={styles.reset}>
          Le quote si azzerano il{' '}
          {new Date(usage.resetsAt).toLocaleDateString('it-IT')}. Le analisi
          non usate non si accumulano al mese successivo.
        </Text>
      </Card>

      {/* Azioni */}
      {!isPremium && (
        <Button
          title="Scopri Premium"
          icon={<Ionicons name="star" size={18} color={colors.textOnPrimary} />}
          onPress={() => router.push('/paywall')}
          style={styles.action}
        />
      )}
      <Button
        title="Ripristina acquisto"
        variant="outline"
        icon={<Ionicons name="refresh-outline" size={18} color={colors.accent} />}
        onPress={() => {}}
        style={styles.action}
      />
      <Text style={styles.restoreNote}>
        Se hai già un abbonamento su questo account store, lo recuperiamo dal
        tuo profilo.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  planName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xxs,
  },
  renewal: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quotaGap: {
    marginTop: spacing.md,
  },
  quotaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quotaTitle: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  quotaValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  reset: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  action: {
    marginBottom: spacing.sm,
  },
  restoreNote: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

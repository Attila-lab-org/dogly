/**
 * Abbonamento (Spec V1 sez. 21): piano corrente, quote d'uso dal ledger
 * (behavior x/3, digestive x/3 — NO unlimited), rinnovo, ripristina acquisto.
 * GET /v1/subscription/status + GET /v1/usage.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingState,
  ProgressBar,
  ScreenContainer,
} from '@/components';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useSubscriptionState } from '@/features/billing/useSubscription';

const PLAN_LABELS = {
  FREE: 'Free',
  PREMIUM_MONTHLY: 'Premium mensile',
  PREMIUM_ANNUAL: 'Premium annuale',
} as const;

export default function SubscriptionScreen() {
  const router = useRouter();
  const { live, query, state } = useSubscriptionState();

  // Live: mai fallback silenzioso al mock — loading ed errore sono visibili.
  if (live && query.isLoading) {
    return (
      <ScreenContainer style={styles.screen}>
        <StackScreenHeader title="Abbonamento" />
        <LoadingState message="Sto leggendo il tuo piano…" />
      </ScreenContainer>
    );
  }

  if (live && (query.isError || !state)) {
    return (
      <ScreenContainer style={styles.screen}>
        <StackScreenHeader title="Abbonamento" />
        <ErrorState
          title="Piano non disponibile"
          message="Non riesco a leggere lo stato dell'abbonamento. Controlla la connessione e riprova: nel frattempo non cambia nulla sul tuo piano."
          retryLabel="Riprova"
          onRetry={() => void query.refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!state) return null;
  const { plan, renewsAt, usage } = state;
  const isPremium = plan !== 'FREE';
  const behaviorLimit = Math.max(1, usage.behaviorLimit);
  const digestiveLimit = Math.max(1, usage.digestiveLimit);

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Abbonamento" />

      {/* Piano corrente */}
      <Card style={styles.card}>
        <View style={styles.planHeader}>
          <View style={styles.planLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.tealSoft }]}>
              <Ionicons name="star-outline" size={18} color={colors.teal} />
            </View>
            <View>
              <Text style={styles.planLabel}>Piano attuale</Text>
              <Text style={styles.planName}>{PLAN_LABELS[plan]}</Text>
            </View>
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
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="stats-chart-outline" size={18} color="#0284C7" />
          </View>
          <Text style={styles.sectionTitle}>Utilizzo di questo mese</Text>
        </View>

        <View style={styles.quotaHeader}>
          <View style={styles.quotaTitleRow}>
            <View style={[styles.miniIcon, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="videocam-outline" size={14} color="#0284C7" />
            </View>
            <Text style={styles.quotaTitle}>Analisi comportamentali</Text>
          </View>
          <Text style={styles.quotaValue}>
            {usage.behaviorUsed}/{behaviorLimit}
          </Text>
        </View>
        <ProgressBar
          progress={usage.behaviorUsed / behaviorLimit}
          tone="primary"
        />

        <View style={[styles.quotaHeader, styles.quotaGap]}>
          <View style={styles.quotaTitleRow}>
            <View style={[styles.miniIcon, { backgroundColor: colors.tealSoft }]}>
              <Ionicons name="camera-outline" size={14} color={colors.teal} />
            </View>
            <Text style={styles.quotaTitle}>Analisi digestive</Text>
          </View>
          <Text style={styles.quotaValue}>
            {usage.digestiveUsed}/{digestiveLimit}
          </Text>
        </View>
        <ProgressBar
          progress={usage.digestiveUsed / digestiveLimit}
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
      <Text style={styles.restoreNote}>
        Gli acquisti e il ripristino dallo store arrivano con una prossima
        versione. Per la beta puoi continuare a usare DOGly.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  card: {
    marginBottom: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  planLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  planName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
    marginTop: spacing.xxs,
  },
  renewal: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: typography.weight.medium,
    color: '#1A2B48',
    flex: 1,
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
    fontSize: 15,
    color: '#1A2B48',
    fontWeight: typography.weight.medium,
  },
  quotaValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
  },
  reset: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
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

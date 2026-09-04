/**
 * Paywall (Spec V1 sez. 21 / 21.2): elegante, NESSUN dark pattern.
 * - Mai prima del primo valore (il paywall si apre solo su quota esaurita
 *   o funzione premium);
 * - benefit list chiara; due piani (Mensile/Annuale con badge "Risparmia 25%");
 * - il piano FREE resta sempre visibile come scelta;
 * - nota "Nessun addebito prima della conferma dello store";
 * - NO unlimited: 30+30 analisi/mese dichiarate apertamente.
 * Stati mandatory (sez. 6): purchase, restore, grace (banner gentile),
 * unavailable store (stato dedicato con retry / "Ripristina").
 * Prezzi, benefit e allowance arrivano dal mock centralizzato
 * src/mocks/entitlements.ts — in produzione da RevenueCat offerings +
 * backend entitlements (Spec 4.1/21).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { demoFlags } from '@/mocks/demo';
import { entitlementMock, paywallOfferingMock } from '@/mocks/entitlements';
import type { PaywallPlan } from '@/mocks/entitlements';

type PlanOption = PaywallPlan['code'];

export default function PaywallScreen() {
  const router = useRouter();
  const { plans, benefits, freeChoiceLabel } = paywallOfferingMock;
  const [selected, setSelected] = useState<PlanOption>('PREMIUM_ANNUAL');

  // Stati simulabili via flag demo (src/mocks/demo.ts) finché RevenueCat non
  // è collegato: "unavailable store" e "grace" (sez. 6 Paywall).
  const [storeUnavailable, setStoreUnavailable] = useState(
    !paywallOfferingMock.storeAvailable || demoFlags.paywallStoreUnavailable,
  );
  const gracePeriod = demoFlags.paywallGracePeriod
    ? true
    : entitlementMock.status === 'grace_period';

  // Stato "unavailable store" (sez. 6): offerings non caricabili → stato
  // dedicato con retry e "Ripristina" (sez. 21.1), mai una schermata vuota.
  if (storeUnavailable) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ErrorState
          title="Store non disponibile"
          message="Non riesco a caricare i piani dallo store in questo momento. Nessun addebito è stato fatto: riprova tra poco o ripristina un acquisto esistente."
          retryLabel="Riprova"
          onRetry={() => setStoreUnavailable(false)}
        />
        <Button
          title="Ripristina acquisto"
          variant="outline"
          onPress={() => {}}
          style={styles.restore}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="star" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>Conosci Rocky ancora meglio</Text>
        <Text style={styles.subtitle}>
          Sblocca più analisi e tutta la storia di Rocky, senza rinunciare al
          piano gratuito.
        </Text>
      </View>

      {/* Grace period (sez. 6/21.1): banner gentile, nessuna urgenza artificiale */}
      {gracePeriod && (
        <View style={styles.graceBanner} accessibilityLiveRegion="polite">
          <Ionicons name="heart-outline" size={18} color={colors.primary} />
          <Text style={styles.graceText}>{entitlementMock.graceMessage}</Text>
        </View>
      )}

      {/* Benefit list */}
      <Card style={styles.benefitsCard}>
        {benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </Card>

      {/* Piani (dal mock entitlements; in produzione: RevenueCat offerings) */}
      {plans.map((plan) => {
        const active = selected === plan.code;
        return (
          <Pressable
            key={plan.code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setSelected(plan.code)}
          >
            <View style={[styles.planCard, active && styles.planCardActive]}>
              <View style={styles.planText}>
                <View style={styles.planTitleRow}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  {plan.badge && <Chip label={plan.badge} tone="success" />}
                </View>
                <Text style={styles.planPrice}>
                  {plan.price}{' '}
                  <Text style={styles.planPer}>{plan.per}</Text>
                </Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={active ? colors.primary : colors.textMuted}
              />
            </View>
          </Pressable>
        );
      })}

      <Button
        title="Acquista"
        onPress={() => {}}
        style={styles.buy}
      />
      <Button
        title="Ripristina acquisto"
        variant="outline"
        onPress={() => {}}
        style={styles.restore}
      />

      {/* Il piano FREE resta sempre visibile come scelta (no dark pattern) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.freeChoice}
      >
        <Text style={styles.freeChoiceText}>{freeChoiceLabel}</Text>
      </Pressable>

      <Text style={styles.legal}>
        Nessun addebito prima della conferma dello store. Puoi annullare il
        rinnovo in qualsiasi momento dalle impostazioni del tuo account store.
        Le analisi non utilizzate non si accumulano.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  graceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  graceText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginTop: spacing.sm,
  },
  benefitsCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  benefitText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  planCardActive: {
    borderColor: colors.primary,
  },
  planText: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  planPrice: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xxs,
  },
  planPer: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.regular,
    color: colors.textSecondary,
  },
  buy: {
    marginTop: spacing.sm,
  },
  restore: {
    marginTop: spacing.sm,
  },
  freeChoice: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  freeChoiceText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    textAlign: 'center',
  },
  legal: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});

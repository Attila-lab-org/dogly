/**
 * Paywall (Spec V1 sez. 21 / 21.2): elegante, NESSUN dark pattern.
 * - Mai prima del primo valore (il paywall si apre solo su quota esaurita
 *   o funzione premium);
 * - benefit list chiara; due piani (Mensile/Annuale con badge "Consigliato");
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
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { demoFlags } from '@/mocks/demo';
import { entitlementMock, paywallOfferingMock } from '@/mocks/entitlements';
import type { PaywallPlan } from '@/mocks/entitlements';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';

type PlanOption = PaywallPlan['code'];

export default function PaywallScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const { plans, benefits, freeChoiceLabel } = paywallOfferingMock;
  const [selected, setSelected] = useState<PlanOption>('PREMIUM_ANNUAL');
  const explainStorePending = () => {
    Alert.alert(
      'Acquisti in arrivo',
      'Lo store non è ancora collegato in questa build. Nessun addebito è stato fatto: puoi continuare con il piano Free.',
    );
  };

  // Stati simulabili via flag demo (src/mocks/demo.ts) finché RevenueCat non
  // è collegato: "unavailable store" e "grace" (sez. 6 Paywall).
  const [storeUnavailable, setStoreUnavailable] = useState(
    !usingMockGate ||
      !paywallOfferingMock.storeAvailable ||
      demoFlags.paywallStoreUnavailable,
  );
  const gracePeriod = demoFlags.paywallGracePeriod
    ? true
    : entitlementMock.status === 'grace_period';

  // Stato "unavailable store" (sez. 6): offerings non caricabili → stato
  // dedicato con retry e "Ripristina" (sez. 21.1), mai una schermata vuota.
  if (storeUnavailable) {
    return (
      <ScreenContainer style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color="#1A2B48" />
          </Pressable>
        </View>
        <ErrorState
          title="Store non disponibile"
          message="Non riesco a caricare i piani dallo store in questo momento. Nessun addebito è stato fatto: riprova tra poco o ripristina un acquisto esistente."
          retryLabel="Riprova"
          onRetry={() => setStoreUnavailable(!usingMockGate)}
        />
        <Button
          title="Ripristina acquisto"
          variant="outline"
          onPress={explainStorePending}
          style={styles.restore}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color="#1A2B48" />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>
          Capisci {dog.name} ogni giorno senza limiti
        </Text>
        <Text style={styles.subtitle}>
          Sblocca più analisi e tutta la storia di {dog.name}, senza rinunciare
          al piano gratuito.
        </Text>
      </View>

      {/* Grace period (sez. 6/21.1): banner gentile, nessuna urgenza artificiale */}
      {gracePeriod && (
        <View style={styles.graceBanner} accessibilityLiveRegion="polite">
          <Ionicons name="heart-outline" size={18} color="#2DAAAB" />
          <Text style={styles.graceText}>{entitlementMock.graceMessage}</Text>
        </View>
      )}

      {/* Benefit list */}
      <View style={styles.benefitsCard}>
        {benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={20} color="#2DAAAB" />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

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
                  {plan.badge ? (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>{plan.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.planPrice}>
                  {plan.price}{' '}
                  <Text style={styles.planPer}>{plan.per}</Text>
                </Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={active ? '#2DAAAB' : colors.textMuted}
              />
            </View>
          </Pressable>
        );
      })}

      <Button
        title="Acquista"
        onPress={explainStorePending}
        style={styles.buy}
      />
      <Button
        title="Ripristina acquisto"
        variant="outline"
        onPress={explainStorePending}
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
  safe: {
    backgroundColor: '#F8FAFC',
  },
  graceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#E0F7F6',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  graceText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: '#1A2B48',
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
    textAlign: 'left',
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'left',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginTop: spacing.sm,
  },
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  benefitText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: '#1A2B48',
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  planCardActive: {
    borderColor: '#2DAAAB',
    backgroundColor: '#FFFFFF',
  },
  planText: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  planTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#1A2B48',
  },
  recommendedBadge: {
    backgroundColor: '#E0F7F6',
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  recommendedBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: '#2DAAAB',
  },
  planPrice: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
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
    color: '#2DAAAB',
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

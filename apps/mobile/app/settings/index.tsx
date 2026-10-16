/**
 * Settings (Spec V1 sez. 5.1 — drill-down dal tab Rocky).
 * Lista: profilo del cane, notifiche, privacy, abbonamento.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { SpringPress } from '@/components/pressSpring';
import { hapticLight } from '@/lib/haptics';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSubscriptionState } from '@/features/billing/useSubscription';
import { useSession } from '@/features/auth/SessionProvider';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: string | null;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, usingMockGate } = useSession();
  const { dog } = useDogProfile();
  // Stessa fonte della schermata Abbonamento (query condivisa): il
  // sottotitolo riflette lo stato reale, non sempre il mock.
  const { live, query, state: subscription } = useSubscriptionState();
  // The edit screen also works for the local profile used before the first
  // sync. Settings should never make the profile row look disabled.

  const subscriptionSubtitle = (() => {
    if (live && query.isLoading) return 'Verifica del piano in corso…';
    if (live && query.isError) {
      return 'Stato non disponibile: apri per riprovare';
    }
    return subscription && subscription.plan !== 'FREE'
      ? 'Premium attivo'
      : 'Piano Free — 3+3 analisi al mese';
  })();

  const rows: Row[] = [
    {
      icon: 'paw-outline',
      title: dog.name ? `Profilo di ${dog.name}` : 'Profilo del cane',
      subtitle: 'Nome, foto, razza e dettagli',
      href: dog.id ? `/dogs/${dog.id}/edit` : null,
    },
    {
      icon: 'notifications-outline',
      title: 'Notifiche',
      subtitle: 'Cosa vuoi ricevere e quando',
      href: '/settings/notifications',
    },
    {
      icon: 'shield-checkmark-outline',
      title: 'Privacy e dati',
      subtitle: 'Consensi, esportazione, eliminazione account',
      href: '/settings/privacy',
    },
    {
      icon: 'star-outline',
      title: 'Abbonamento',
      subtitle: subscriptionSubtitle,
      href: '/settings/subscription',
    },
  ];

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Impostazioni" />
      <Card noPadding>
        {rows.map((row, index) => (
          <SpringPress
            key={row.title}
            accessibilityRole="button"
            disabled={row.href === null}
            onPress={() => {
              void hapticLight();
              if (row.href) router.push(row.href as never);
            }}
            scaleTo={0.98}
            pressableStyle={[
              styles.row,
              index < rows.length - 1 && styles.rowDivider,
              row.href === null && styles.rowDisabled,
            ]}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={row.icon} size={20} color={colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </SpringPress>
        ))}
      </Card>
      {!usingMockGate ? (
        <Button
          title="Esci"
          variant="outline"
          onPress={() => {
            void signOut().then(() => router.replace('/(auth)/welcome'));
          }}
          style={styles.signOut}
        />
      ) : null}
      <Text style={styles.version}>DOGly</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  version: {
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  signOut: {
    marginTop: spacing.xl,
  },
});

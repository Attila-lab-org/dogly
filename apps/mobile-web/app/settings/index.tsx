/**
 * Settings (Spec V1 sez. 5.1 — drill-down dal tab Rocky).
 * Lista: profilo, notifiche, privacy, abbonamento.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { isPersistedId } from '@/lib/persistedId';
import { useSubscriptionState } from '@/features/billing/useSubscription';
import { useSession } from '@/features/auth/SessionProvider';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  href: string | null;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, usingMockGate } = useSession();
  // Stessa fonte della schermata Abbonamento (query condivisa): il
  // sottotitolo riflette lo stato reale, non sempre il mock.
  const { live, query, state: subscription } = useSubscriptionState();
  const { dog } = useDogProfile();
  const dogId = isPersistedId(dog.id) ? dog.id : '';

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
      icon: 'person-outline',
      iconBg: '#E0F2FE',
      iconColor: '#0284C7',
      title: 'Profilo',
      subtitle: 'Dati del cane e avatar',
      href: dogId ? `/dogs/${dogId}/edit` : null,
    },
    {
      icon: 'notifications-outline',
      iconBg: colors.tealSoft,
      iconColor: colors.teal,
      title: 'Notifiche',
      subtitle: 'Cosa vuoi ricevere e quando',
      href: '/settings/notifications',
    },
    {
      icon: 'shield-checkmark-outline',
      iconBg: '#E0F2FE',
      iconColor: '#0284C7',
      title: 'Privacy e dati',
      subtitle: 'Consensi, esportazione, eliminazione account',
      href: '/settings/privacy',
    },
    {
      icon: 'star-outline',
      iconBg: colors.tealSoft,
      iconColor: colors.teal,
      title: 'Abbonamento',
      subtitle: subscriptionSubtitle,
      href: '/settings/subscription',
    },
  ];

  return (
    <ScreenContainer scroll style={styles.screen}>
      <StackScreenHeader title="Impostazioni" />
      <Card noPadding style={styles.group}>
        {rows.map((row, index) => (
          <Pressable
            key={row.title}
            accessibilityRole="button"
            disabled={row.href === null}
            onPress={() => row.href && router.push(row.href as never)}
            style={[
              styles.row,
              index < rows.length - 1 && styles.rowDivider,
              row.href === null && styles.rowDisabled,
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: row.iconBg }]}>
              <Ionicons name={row.icon} size={18} color={row.iconColor} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.iconMuted}
            />
          </Pressable>
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
      <Text style={styles.version}>Dogly · V1 beta</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  group: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: typography.weight.medium,
    color: '#1A2B48',
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

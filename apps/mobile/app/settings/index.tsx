/**
 * Settings (Spec V1 sez. 5.1 — drill-down dal tab Rocky).
 * Lista: profilo, notifiche, privacy, abbonamento.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { subscriptionMock } from '@/mocks/secondary';
import { getDogProfileSnapshot } from '@/features/core/useDogProfile';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: string | null;
}

export default function SettingsScreen() {
  const router = useRouter();
  const isPremium = subscriptionMock.plan !== 'FREE';
  const dogId = getDogProfileSnapshot().dog.id;

  const rows: Row[] = [
    {
      icon: 'person-outline',
      title: 'Profilo',
      subtitle: 'Dati del cane e avatar',
      href: `/dogs/${dogId}/edit`,
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
      subtitle: isPremium ? 'Premium attivo' : 'Piano Free — 3+3 analisi al mese',
      href: '/settings/subscription',
    },
  ];

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Impostazioni" />
      <Card noPadding>
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
          </Pressable>
        ))}
      </Card>
      <Text style={styles.version}>Dogly · V1 beta</Text>
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
});

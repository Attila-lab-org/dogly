import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, DogIllustration, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const TIPS = [
  { icon: 'sunny-outline' as const, label: 'Usa una buona luce naturale' },
  { icon: 'scan-outline' as const, label: 'Inquadra solo le feci' },
  { icon: 'arrow-down-outline' as const, label: 'Scatta dall’alto e da vicino' },
  { icon: 'flash-off-outline' as const, label: 'Evita ombre e riflessi forti' },
];

export default function DigestiveOverviewScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Controllo digestione" />
      <View style={styles.hero}>
        <DogIllustration mood="welcome" size={200} />
        <Text style={styles.title}>Controlliamo le feci di {dog.name}</Text>
        <Text style={styles.subtitle}>
          Una foto chiara mi aiuta a confrontare questo momento con il suo solito.
        </Text>
      </View>

      <Card style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>Per una foto migliore</Text>
        {TIPS.map((tip) => (
          <View key={tip.label} style={styles.tipRow}>
            <View style={styles.tipIcon}>
              <Ionicons name={tip.icon} size={18} color={colors.accent} />
            </View>
            <Text style={styles.tipText}>{tip.label}</Text>
          </View>
        ))}
      </Card>

      <Button
        title="Scatta la foto"
        icon={<Ionicons name="camera" size={20} color={colors.textOnPrimary} />}
        onPress={() => router.push('/digestive/capture' as never)}
      />
      <Text style={styles.footnote}>
        Una foto è un’osservazione, non una diagnosi. Se qualcosa ti preoccupa, chiedi al veterinario.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', gap: spacing.sm },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  tipsCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radius.lg },
  tipsTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.sm },
  footnote: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
});

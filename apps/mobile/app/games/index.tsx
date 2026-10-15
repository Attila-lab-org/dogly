/**
 * Hub "Giochi": mini-giochi da giocare insieme al cane.
 * "Scoiattolo!" è giocabile; Agility e Fiuto da campione arrivano dopo.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { SquirrelArt } from '@/features/games/squirrelArt';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

export default function GamesHubScreen() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Giochi" />
      <Text style={styles.intro}>
        Tre minuti di gioco insieme valgono più di un’ora di divano. Scegliete
        la vostra sfida.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gioca a Scoiattolo!"
        onPress={() => router.push('/games/squirrel' as never)}
        style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={['#DFF3EC', '#EAF7F1', '#FFF6E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Scoiattolo!</Text>
          <Text style={styles.heroText}>
            Gli scoiattoli sbucano dalle buche: acchiappali prima che
            scappino. Attento al riccio: è un amico!
          </Text>
          <View style={styles.heroCta}>
            <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
            <Text style={styles.heroCtaText}>Gioca · 30 secondi</Text>
          </View>
        </View>
        <SquirrelArt size={108} />
      </Pressable>

      <View style={styles.lockedRow}>
        <LockedGame
          icon="walk"
          title="Agility"
          text="Ostacoli, slalom e tempi da record."
        />
        <LockedGame
          icon="paw"
          title="Fiuto da campione"
          text="Nascondi, cerca, trova: naso d’oro."
        />
      </View>
    </ScreenContainer>
  );
}

function LockedGame({
  icon,
  title,
  text,
}: {
  icon: 'walk' | 'paw';
  title: string;
  text: string;
}) {
  return (
    <View style={styles.lockedCard} accessibilityLabel={`${title}, in arrivo`}>
      <View style={styles.lockedIcon}>
        {icon === 'walk' ? (
          <Ionicons name="walk-outline" size={22} color={colors.textMuted} />
        ) : (
          <CuteIcon name="paw" size={22} color={colors.textMuted} secondary={colors.textMuted} />
        )}
      </View>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedText}>{text}</Text>
      <View style={styles.lockedChip}>
        <Text style={styles.lockedChipText}>In arrivo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  heroText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroCtaText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  lockedRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  lockedCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
    opacity: 0.75,
  },
  lockedIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  lockedTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  lockedText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  lockedChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  lockedChipText: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.9 },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { SpringPress } from '@/components/pressSpring';

export function WalkLaunchCard({ dogName }: { dogName: string }) {
  const router = useRouter();
  return (
    <Animated.View entering={FadeInUp.duration(360).delay(80)}>
      <SpringPress
        accessibilityRole="button"
        accessibilityLabel={`Inizia una passeggiata con ${dogName}`}
        onPress={() => router.push('/walk' as never)}
        pressableStyle={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={['#E4F4EF', '#F4FBF8', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orb} />
        <View style={styles.iconWrap}>
          <Ionicons name="walk-outline" size={24} color={colors.accentPressed} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>IL VOSTRO MOMENTO</Text>
          <Text style={styles.title}>Una passeggiata?</Text>
          <Text style={styles.subtitle}>Segui il ritmo di {dogName} e trasformalo in un ricordo.</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={19} color={colors.textOnPrimary} />
        </View>
      </SpringPress>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#CDEDE2',
    ...shadows.card,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D8F4E9',
  },
  copy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.accentPressed, fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 1.1 },
  title: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 19 },
  arrow: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(20,184,166,0.07)', right: 18, top: -54 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
});

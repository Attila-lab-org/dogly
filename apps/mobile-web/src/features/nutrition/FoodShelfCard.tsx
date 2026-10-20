/**
 * Card scaffale per il catalogo alimenti: pack grande, tap = scegli.
 */
import React from 'react';
import Animated from 'react-native-reanimated';
import { usePressSpring } from '../../components/pressSpring';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type ShelfFood = {
  barcode?: string | null;
  brand?: string | null;
  name?: string | null;
  image_url?: string | null;
  package_size?: string | null;
  food_form?: string | null;
  variant?: string | null;
};

export function shelfCardWidth(windowWidth: number): number {
  const gutter = spacing.lg * 2;
  const gap = 12;
  return Math.floor((Math.min(windowWidth, 560) - gutter - gap) / 2);
}

export function FoodShelfCard({
  item,
  width,
  onPress,
}: {
  item: ShelfFood;
  width: number;
  onPress: () => void;
}) {
  const press = usePressSpring();
  const meta = [item.package_size, item.food_form, item.variant]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 2)
    .join(' · ');

  return (
    <Animated.View style={press.style}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.brand ?? ''} ${item.name ?? 'Alimento'}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.pack}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.image} />
        ) : (
          <LinearGradient
            colors={['#CCFBF1', '#DBEAFE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fallback}
          >
            <Ionicons name="nutrition-outline" size={36} color={colors.accent} />
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(14,42,71,0)', 'rgba(14,42,71,0.08)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
      <Text style={styles.brand} numberOfLines={1}>
        {item.brand || 'Marca'}
      </Text>
      <Text style={styles.name} numberOfLines={2}>
        {item.name || 'Prodotto'}
      </Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
    </Animated.View>
  );
}

export function useShelfCardWidth(): number {
  const { width } = useWindowDimensions();
  return shelfCardWidth(width);
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    marginBottom: 4,
  },
  pack: {
    width: '100%',
    aspectRatio: 0.86,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  name: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    lineHeight: typography.size.sm * 1.3,
    minHeight: typography.size.sm * 1.3 * 2,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});

/**
 * Logo Dogly ufficiale (PNG) — solo splash / welcome auth.
 * Contiene la D con silhouette del cane nel negativo.
 */
import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

const logoSource = require('../../../assets/brand/dogly-logo.png');

export function DoglyLogo({
  width = 220,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}) {
  // Asset landscape ~138:100 ratio from brand mark
  const height = Math.round(width * (100 / 138));

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="Dogly">
      <Image
        source={logoSource}
        style={[{ width, height }, style]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});

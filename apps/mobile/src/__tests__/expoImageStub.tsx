/**
 * Stub jest di expo-image: il modulo è ESM-only e non transpila in ambiente
 * node. I test coprono logica pura; l'immagine non viene mai valutata.
 * Mappato in jest.config.js (moduleNameMapper).
 */
import React from 'react';
import { View } from 'react-native';

export function Image(props: Record<string, unknown>) {
  return React.createElement(View, {
    accessibilityLabel: props.accessibilityLabel as string | undefined,
  });
}

export default Image;

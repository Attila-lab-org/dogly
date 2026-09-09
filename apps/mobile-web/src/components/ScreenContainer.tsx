import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** Abilita scroll verticale */
  scroll?: boolean;
  /** Padding orizzontale/verticale standard (default true) */
  padded?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

/** Contenitore standard di schermata: sfondo freddo chiaro + safe area */
export function ScreenContainer({
  children,
  scroll,
  padded = true,
  style,
  contentStyle,
}: ScreenContainerProps) {
  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.responsive,
        padded && styles.padded,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[styles.flex, styles.responsive, padded && styles.padded, contentStyle]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, style]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {inner}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  responsive: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  padded: {
    padding: spacing.lg,
  },
});

export default ScreenContainer;

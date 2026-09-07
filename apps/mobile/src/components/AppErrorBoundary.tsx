import React, { type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
      tags: { subsystem: 'react-render' },
    });
  }

  private recover = async (): Promise<void> => {
    this.setState({ error: null });
    await Updates.reloadAsync().catch(() => {
      // Expo Go/web may not support reloadAsync; resetting the boundary still
      // gives transient failures a chance to recover.
    });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.screen} accessibilityRole="alert">
        <View style={styles.icon}>
          <Text style={styles.iconText}>!</Text>
        </View>
        <Text style={styles.title}>Dogly ha avuto un imprevisto</Text>
        <Text style={styles.message}>
          I tuoi dati sono al sicuro. Riapriamo l’app per ripartire.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Riapri Dogly"
          onPress={() => void this.recover()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Riapri Dogly</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  icon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: colors.dangerSoft,
  },
  iconText: {
    color: colors.danger,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
});

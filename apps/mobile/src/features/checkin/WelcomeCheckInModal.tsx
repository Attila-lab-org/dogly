/**
 * Modal all’apertura: una domanda, due risposte, poi sparisce.
 * Nessun logo, nessun claim brand — solo il cane e l’utente.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import {
  dismissWelcomeCheckIn,
  markCheckInNeedsCare,
  markCheckInSoftOk,
  useCheckIn,
} from './store';

type Step = 'ask' | 'offer';

export function WelcomeCheckInModal({ dogName }: { dogName: string }) {
  const router = useRouter();
  const { welcomePending } = useCheckIn();
  const [step, setStep] = useState<Step>('ask');

  if (!welcomePending) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismissWelcomeCheckIn}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {step === 'ask' ? (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="paw" size={28} color={colors.accent} />
              </View>
              <Text style={styles.title}>Come ti sembra {dogName}?</Text>
              <Text style={styles.sub}>Un attimo, niente questionario.</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.primaryBtn}
                onPress={markCheckInSoftOk}
              >
                <Text style={styles.primaryBtnText}>Sembra sereno</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => {
                  markCheckInNeedsCare(dogName);
                  setStep('offer');
                }}
              >
                <Text style={styles.secondaryBtnText}>Non come al solito</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={dismissWelcomeCheckIn}
                hitSlop={10}
                style={styles.skip}
              >
                <Text style={styles.skipText}>Non ora</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="heart-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.title}>Vuoi dare un’occhiata insieme?</Text>
              <Text style={styles.sub}>
                Un video breve o un controllo digestivo, pensato per quello che
                hai notato su {dogName}.
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.primaryBtn}
                onPress={() => {
                  dismissWelcomeCheckIn();
                  router.push('/behavior/capture?from=checkin&care=1' as never);
                }}
              >
                <Text style={styles.primaryBtnText}>Fai un video</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => {
                  dismissWelcomeCheckIn();
                  router.push('/digestive/capture?from=checkin' as never);
                }}
              >
                <Text style={styles.secondaryBtnText}>
                  Guarda la digestione
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={dismissWelcomeCheckIn}
                hitSlop={10}
                style={styles.skip}
              >
                <Text style={styles.skipText}>Più tardi</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.raised,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  primaryBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    fontSize: typography.size.md,
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  secondaryBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  skip: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
  },
});

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { persistTodayVsUsual } from './sync';
import {
  dismissWelcomeCheckIn,
  hydrateCheckIn,
  markCheckInNeedsCare,
  markCheckInSoftOk,
  useCheckIn,
} from './store';

export function CheckInModal({
  dogId,
  dogName,
  mockGate,
}: {
  dogId: string;
  dogName: string;
  mockGate: boolean;
}) {
  const router = useRouter();
  const { welcomePending, hydrated, analysisContext } = useCheckIn();
  const [step, setStep] = useState<'ask' | 'cta'>('ask');

  useEffect(() => {
    void hydrateCheckIn();
  }, []);

  useEffect(() => {
    if (analysisContext?.concern === 'off' && welcomePending) {
      setStep('cta');
    }
  }, [analysisContext?.concern, welcomePending]);

  const visible = hydrated && welcomePending && Boolean(dogId);

  const pushRemote = (concern: 'soft' | 'off') => {
    const snapshotNote =
      concern === 'off'
        ? `Hai notato che ${dogName} non è come al solito.`
        : 'Buon segno: confermiamolo con un breve video quando vuoi.';
    void persistTodayVsUsual(
      dogId,
      {
        source: 'checkin',
        concern,
        note: snapshotNote,
        dogId,
      },
      mockGate,
    ).catch(() => {
      // Banner locale resta il fallback offline; l'upload ritenta il PATCH.
    });
  };

  const onSerene = () => {
    markCheckInSoftOk(dogId);
    pushRemote('soft');
  };

  const onOff = () => {
    markCheckInNeedsCare(dogName, dogId);
    pushRemote('off');
    setStep('cta');
  };

  const goCapture = (path: '/behavior/capture' | '/digestive/capture') => {
    dismissWelcomeCheckIn();
    router.push(`${path}?from=checkin` as never);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Card style={styles.sheet} testID="checkin-modal">
          <View style={styles.iconWrap}>
            <Ionicons name="paw" size={28} color={colors.accent} />
          </View>
          {step === 'ask' ? (
            <>
              <Text style={styles.title}>Come ti sembra {dogName}?</Text>
              <Text style={styles.subtitle}>
                Una sola domanda, per capire se oggi è un giorno come gli altri.
              </Text>
              <Button title="Sereno" onPress={onSerene} testID="checkin-soft" />
              <Button
                title="Non come al solito"
                variant="outline"
                onPress={onOff}
                style={styles.second}
                testID="checkin-off"
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>
                Hai notato che {dogName} non è come al solito
              </Text>
              <Text style={styles.subtitle}>
                Un breve video o uno sguardo alla digestione aiutano Dogly a
                leggere questo momento, non un giorno qualunque.
              </Text>
              <Button
                title="Fai un video"
                onPress={() => goCapture('/behavior/capture')}
                testID="checkin-video"
              />
              <Button
                title="Guarda la digestione"
                variant="outline"
                onPress={() => goCapture('/digestive/capture')}
                style={styles.second}
                testID="checkin-digestive"
              />
              <Pressable
                onPress={dismissWelcomeCheckIn}
                style={styles.later}
                testID="checkin-later"
              >
                <Text style={styles.laterLabel}>Più tardi</Text>
              </Pressable>
            </>
          )}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
  },
  second: {
    marginTop: spacing.sm,
  },
  later: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  laterLabel: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});

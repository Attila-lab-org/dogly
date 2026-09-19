/**
 * Pagina dedicata all'invio del video: la telecamera è già chiusa.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isQuotaExhaustedError } from '@/features/behavior/api';
import { purchasesEnabled } from '@/mocks/entitlements';
import {
  discardPendingBehaviorClip,
  enqueueAndUploadBehaviorClip,
} from '@/features/behavior/upload';
import {
  clearPendingBehaviorUpload,
  peekPendingBehaviorUpload,
  type PendingBehaviorUpload,
} from '@/features/behavior/pendingUpload';

const TITLE_COLOR = '#1A2B48';
const MUTED_COLOR = '#64748B';
const PAGE_BG = '#F8FAFC';

export default function BehaviorUploadingScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { loading: sessionLoading, userId, usingMockGate } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(() => !peekPendingBehaviorUpload());
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || error || missing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [error, missing, pulse, reduceMotion]);

  useEffect(() => {
    if (startedRef.current) return;
    if (!usingMockGate && (sessionLoading || !userId)) return;

    const pending = peekPendingBehaviorUpload();
    if (!pending) {
      setMissing(true);
      return;
    }

    startedRef.current = true;
    void runUpload(pending);
  }, [sessionLoading, usingMockGate, userId, dog.id]);

  const runUpload = async (pending: PendingBehaviorUpload) => {
    setError(null);
    try {
      if (usingMockGate) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (!mountedRef.current) return;
        clearPendingBehaviorUpload();
        router.replace('/behavior/processing/evt-processing');
        return;
      }
      if (!userId || !pending.dogId) {
        startedRef.current = false;
        return;
      }
      // Non aprire la pagina di analisi finché il PUT su Storage e il
      // complete backend non hanno confermato che il video è arrivato.
      // Su web la coda è in memoria: navigare prima lascia un evento
      // incompleto se il browser viene ricaricato o perde la pagina.
      const { eventId } = await enqueueAndUploadBehaviorClip({
        userId,
        dogId: pending.dogId,
        localUri: pending.localUri,
        durationMs: pending.durationMs,
        hasAudio: pending.hasAudio,
        contentType: pending.contentType,
      });
      if (!mountedRef.current) return;
      clearPendingBehaviorUpload();
      router.replace(`/behavior/processing/${eventId}`);
    } catch (err) {
      console.error('Behavior upload failed', err);
      if (isQuotaExhaustedError(err) && purchasesEnabled) {
        if (mountedRef.current) router.replace('/paywall');
        return;
      }
      startedRef.current = false;
      if (mountedRef.current) {
        setError('Invio non riuscito. Il video resta qui: puoi riprovare.');
      }
    }
  };

  const retry = () => {
    const pending = peekPendingBehaviorUpload();
    if (!pending) {
      setMissing(true);
      return;
    }
    startedRef.current = true;
    void runUpload(pending);
  };

  const retake = () => {
    const pending = peekPendingBehaviorUpload();
    if (pending && userId) {
      void discardPendingBehaviorClip(userId, pending.localUri);
    }
    clearPendingBehaviorUpload();
    router.replace('/behavior/capture');
  };

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.12],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.12],
  });

  return (
    <ScreenContainer style={styles.screen} contentStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <Text style={styles.topTitle} numberOfLines={1}>
          Invio in corso
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View
        style={styles.hero}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          missing
            ? 'Non trovo il video da inviare'
            : error
              ? error
              : `Sto inviando il video di ${dog.name}`
        }
      >
        <View style={styles.visual}>
          {!reduceMotion && !error && !missing ? (
            <Animated.View
              style={[
                styles.ring,
                { opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
          ) : null}
          <View style={[styles.icon, (error || missing) && styles.iconError]}>
            <CuteIcon name={error || missing ? 'cloud' : 'search'} size={54} />
          </View>
        </View>
        <Text style={styles.title}>
          {missing
            ? 'Non trovo il video'
            : error
              ? 'Invio non riuscito'
              : `Sto inviando il video di ${dog.name}`}
        </Text>
        <Text style={styles.detail}>
          {missing
            ? 'La telecamera è chiusa. Registra di nuovo per partire con l’analisi.'
            : error
              ? 'La telecamera resta chiusa. Puoi riprovare l’invio o registrare un altro video.'
              : 'La telecamera è chiusa. Tra poco inizio a osservare il video.'}
        </Text>
      </View>

      {error || missing ? (
        <View style={styles.actions}>
          {error ? (
            <Button
              title="Riprova invio"
              onPress={retry}
              style={styles.button}
            />
          ) : null}
          <Button
            title="Registra di nuovo"
            variant={error ? 'outline' : 'primary'}
            onPress={retake}
            style={styles.button}
          />
        </View>
      ) : (
        <View style={styles.waitRow}>
          <Ionicons name="cloud-upload-outline" size={18} color={colors.teal} />
          <Text style={styles.waitText}>Caricamento in corso…</Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: PAGE_BG,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: TITLE_COLOR,
    fontSize: 17,
    fontWeight: typography.weight.semibold,
  },
  topSpacer: {
    width: 40,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  visual: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ring: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#E0F2F7',
  },
  icon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F7',
  },
  iconError: {
    backgroundColor: colors.coralSoft,
  },
  title: {
    color: TITLE_COLOR,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    alignSelf: 'stretch',
  },
  detail: {
    maxWidth: 320,
    marginTop: spacing.xs,
    color: MUTED_COLOR,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  waitRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  waitText: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: typography.weight.semibold,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  button: {
    alignSelf: 'stretch',
  },
});

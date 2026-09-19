import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import {
  colors,
  radius,
  shadows,
  spacing,
  typography,
} from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useCheckIn } from '@/features/checkin/store';
import { useSession } from '@/features/auth/SessionProvider';
import { takeDigestivePhoto } from '@/features/digestive/photo';
import {
  discardPendingDigestivePhoto,
  enqueueAndUploadDigestivePhoto,
} from '@/features/digestive/upload';
import { isQuotaExhaustedError } from '@/features/behavior/api';
import { purchasesEnabled } from '@/mocks/entitlements';

type Phase = 'ready' | 'preview' | 'uploading' | 'upload_failed';

export default function DigestiveCaptureScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { loading: sessionLoading, userId, usingMockGate } = useSession();
  const { analysisContext } = useCheckIn();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromCheckIn =
    params.from === 'checkin' || analysisContext?.concern === 'off';
  const [phase, setPhase] = useState<Phase>('ready');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const takePhoto = async () => {
    // "Rifai la foto": la foto scartata non resta in coda upload.
    if (photoUri && userId) {
      void discardPendingDigestivePhoto(userId, photoUri);
    }
    setPickerError(null);
    try {
      const uri = await takeDigestivePhoto();
      if (!uri) return;
      setPhotoUri(uri);
      setPhase('preview');
    } catch {
      setPickerError(
        'Non sono riuscito ad aprire la fotocamera. Tocca di nuovo e consenti l’accesso.',
      );
    }
  };

  const analyzePhoto = async () => {
    if (!photoUri) return;
    setPhase('uploading');
    try {
      if (usingMockGate) {
        // Mock gate dev: pipeline finta solo in demo.
        await new Promise((resolve) => setTimeout(resolve, 800));
        router.replace('/digestive/processing/fecal-ok-1');
        return;
      }
      if (sessionLoading || !userId || !dog.id) {
        setPhase('upload_failed');
        return;
      }
      const { eventId } = await enqueueAndUploadDigestivePhoto({
        userId,
        dogId: dog.id,
        localUri: photoUri,
      });
      router.replace(`/digestive/processing/${eventId}`);
    } catch (err) {
      if (isQuotaExhaustedError(err) && purchasesEnabled) {
        router.replace('/paywall');
        return;
      }
      setPhase('upload_failed');
    }
  };

  return (
    <ScreenContainer
      scroll
      style={styles.screen}
      contentStyle={styles.content}
    >
      <StackScreenHeader title="Controllo digestione" />

      {fromCheckIn && analysisContext?.note ? (
        <Text style={styles.careBanner}>{analysisContext.note}</Text>
      ) : null}

      <View style={styles.viewport}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} />
        ) : (
          <View style={styles.viewportEmpty}>
            <View style={styles.viewportIcon}>
              <Ionicons name="camera-outline" size={36} color={colors.teal} />
            </View>
            <Text style={styles.viewportTitle}>
              Analizza la digestione di {dog.name}
            </Text>
            <Text style={styles.viewportSubtitle}>
              Una foto chiara, poi la confronto con il suo solito.
            </Text>
          </View>
        )}
      </View>

      {!photoUri ? (
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Per una foto migliore</Text>
          <PhotoTip icon="sunny-outline" label="Usa una buona luce naturale" />
          <PhotoTip icon="scan-outline" label="Inquadra solo le feci" />
          <PhotoTip icon="arrow-down-outline" label="Scatta dall’alto e da vicino" />
          <PhotoTip icon="flash-off-outline" label="Evita ombre e riflessi forti" />
        </View>
      ) : (
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Va bene questa foto?</Text>
          <Text style={styles.previewHint}>
            Controlla che l’immagine sia nitida e ben illuminata.
          </Text>
        </View>
      )}

      {pickerError ? (
        <View style={styles.error}>
          <Ionicons name="camera-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{pickerError}</Text>
        </View>
      ) : null}

      {phase === 'upload_failed' ? (
        <View style={styles.error}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText}>
            Caricamento non riuscito. La foto è ancora disponibile.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {phase === 'ready' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scatta foto"
            onPress={() => void takePhoto()}
            hitSlop={12}
            style={({ pressed }) => [
              styles.shutter,
              pressed && styles.shutterPressed,
            ]}
            testID="digestive-shutter"
          >
            <View style={styles.shutterInner}>
              <Ionicons name="camera" size={28} color={colors.teal} />
            </View>
          </Pressable>
        ) : null}

        {phase === 'preview' || phase === 'upload_failed' ? (
          <>
            <Button
              title={
                phase === 'upload_failed' ? 'Riprova' : 'Usa questa foto'
              }
              icon={
                <Ionicons
                  name={phase === 'upload_failed' ? 'refresh' : 'sparkles'}
                  size={18}
                  color={colors.textOnPrimary}
                />
              }
              onPress={() => void analyzePhoto()}
            />
            <Button
              title="Rifai la foto"
              variant="outline"
              onPress={() => void takePhoto()}
            />
          </>
        ) : null}

        {phase === 'uploading' ? (
          <Button title="Caricamento…" loading disabled />
        ) : null}
      </View>

      <View style={styles.safetyNote}>
        <Ionicons
          name="shield-checkmark-outline"
          size={17}
          color={colors.textSecondary}
        />
        <Text style={styles.safetyText}>
          Osservazione automatica, non diagnosi veterinaria.
        </Text>
      </View>
    </ScreenContainer>
  );
}

function PhotoTip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.tip}>
      <View style={styles.tipIcon}>
        <Ionicons name={icon} size={16} color={colors.teal} />
      </View>
      <Text style={styles.tipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingBottom: spacing.xxxl,
  },
  careBanner: {
    marginBottom: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  viewport: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0E2A47',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: spacing.lg,
  },
  preview: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  viewportEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: '#E8F4F4',
  },
  viewportIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.xs,
    ...shadows.card,
  },
  viewportTitle: {
    color: '#1A2B48',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  viewportSubtitle: {
    color: '#64748B',
    fontSize: typography.size.sm,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  tipsCard: {
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    ...shadows.card,
  },
  tipsTitle: {
    marginBottom: spacing.xs,
    color: '#1A2B48',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  previewHint: {
    color: '#64748B',
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 30,
  },
  tipIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.tealSoft,
  },
  tipLabel: {
    flex: 1,
    color: '#1A2B48',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  shutterPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    ...shadows.none,
  },
  safetyText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
});

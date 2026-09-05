import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
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
import { isApiConfigured } from '@/features/auth/env';

type Phase = 'ready' | 'preview' | 'uploading' | 'upload_failed';

export default function DigestiveCaptureScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const { analysisContext } = useCheckIn();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromCheckIn =
    params.from === 'checkin' || analysisContext?.concern === 'off';
  const [phase, setPhase] = useState<Phase>('ready');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const takePhoto = async () => {
    // "Rifai la foto": la foto scartata non resta in coda upload.
    if (photoUri && userId) {
      void discardPendingDigestivePhoto(userId, photoUri);
    }
    const uri = await takeDigestivePhoto();
    if (!uri) return;
    setPhotoUri(uri);
    setPhase('preview');
  };

  const analyzePhoto = async () => {
    if (!photoUri) return;
    setPhase('uploading');
    try {
      if (usingMockGate || !isApiConfigured() || !userId || !dog.id) {
        // Mock gate dev: pipeline finta solo in demo.
        await new Promise((resolve) => setTimeout(resolve, 800));
        router.replace('/digestive/processing/fecal-ok-1');
        return;
      }
      const { eventId } = await enqueueAndUploadDigestivePhoto({
        userId,
        dogId: dog.id,
        localUri: photoUri,
      });
      router.replace(`/digestive/processing/${eventId}`);
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        // Quota esaurita (402 QUOTA_EXHAUSTED): paywall, non errore generico.
        router.replace('/paywall');
        return;
      }
      setPhase('upload_failed');
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Digestione" />

      {fromCheckIn && analysisContext?.note ? (
        <Text style={styles.careBanner}>{analysisContext.note}</Text>
      ) : null}

      <View style={styles.heading}>
        <Text style={styles.title}>
          {photoUri ? 'Va bene questa foto?' : 'Scatta una foto'}
        </Text>
        {!photoUri ? (
          <Text style={styles.subtitle}>
            La confronterò con le osservazioni precedenti di {dog.name}.
          </Text>
        ) : null}
      </View>

      <Card noPadding style={styles.photoCard}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scatta una foto"
            onPress={takePhoto}
            style={styles.cameraArea}
          >
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={34} color={colors.accent} />
            </View>
            <Text style={styles.cameraLabel}>Tocca per scattare</Text>
          </Pressable>
        )}
      </Card>

      {!photoUri ? (
        <View style={styles.tips}>
          <PhotoTip icon="sunny-outline" label="Buona luce" />
          <PhotoTip icon="scan-outline" label="Da vicino" />
          <PhotoTip icon="arrow-down-outline" label="Dall’alto" />
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
          <Button
            title="Scatta foto"
            icon={
              <Ionicons name="camera" size={19} color={colors.textOnPrimary} />
            }
            onPress={takePhoto}
          />
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
              onPress={analyzePhoto}
            />
            <Button
              title="Rifai la foto"
              variant="outline"
              onPress={takePhoto}
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

function PhotoTip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name={icon} size={17} color={colors.accent} />
      <Text style={styles.tipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  careBanner: {
    marginBottom: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  heading: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  photoCard: {
    overflow: 'hidden',
  },
  cameraArea: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  cameraIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  cameraLabel: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceMuted,
  },
  tips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  tipLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
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
    gap: spacing.sm,
    marginTop: spacing.xl,
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

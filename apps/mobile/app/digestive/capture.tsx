import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, DogIllustration, ScreenContainer } from '@/components';
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
  const { loading: sessionLoading, userId, usingMockGate } = useSession();
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
      if (usingMockGate || !isApiConfigured()) {
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

      {!photoUri ? (
        <>
          <View style={styles.hero}>
            <DogIllustration mood="welcome" size={210} />
            <Text style={styles.title}>Analizza la digestione di {dog.name}</Text>
            <Text style={styles.subtitle}>
              Una foto chiara mi aiuta a confrontare questa osservazione con il
              suo solito.
            </Text>
          </View>

          <Card style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Per una foto migliore</Text>
            <PhotoTip icon="sunny-outline" label="Usa una buona luce naturale" />
            <PhotoTip icon="scan-outline" label="Inquadra solo le feci" />
            <PhotoTip icon="arrow-down-outline" label="Scatta dall’alto e da vicino" />
            <PhotoTip icon="flash-off-outline" label="Evita ombre e riflessi forti" />
          </Card>
        </>
      ) : (
        <>
          <View style={styles.heading}>
            <Text style={styles.title}>Va bene questa foto?</Text>
          <Text style={styles.subtitle}>
              Controlla che l’immagine sia nitida e ben illuminata.
          </Text>
          </View>
          <Card noPadding style={styles.photoCard}>
          <Image source={{ uri: photoUri }} style={styles.preview} />
          </Card>
        </>
      )}

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
      <View style={styles.tipIcon}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={styles.tipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  heading: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceMuted,
  },
  tipsCard: {
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  tipsTitle: {
    marginBottom: spacing.xs,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
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
    backgroundColor: colors.surface,
  },
  tipLabel: {
    flex: 1,
    color: colors.text,
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

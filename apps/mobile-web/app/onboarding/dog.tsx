/**
 * Onboarding cane: primo valore prima dei dettagli.
 *
 * Il nome è l'unica informazione necessaria per iniziare. Età, taglia,
 * razza e abitudini vengono raccolte più avanti, quando aiutano davvero
 * a leggere un momento del cane.
 */
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useQueryClient } from '@tanstack/react-query';
import {
  profileToCreateBody,
  useCreateDogMutation,
} from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { dogsQueryKey } from '@/features/dogs/api';
import { persistDogAvatar } from '@/features/dogs/avatar';
import { pickAvatarPhoto } from '@/features/photos/share';

const dogSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Scrivi il nome del tuo cane per iniziare.'),
  photoUri: z.string().nullable(),
});

type DogDraft = z.infer<typeof dogSchema>;

export default function DogOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { usingMockGate, markDogCreated, userId, hasDog, refreshDogs } =
    useSession();
  const createDog = useCreateDogMutation();
  const [draft, setDraft] = useState<DogDraft>({ name: '', photoUri: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshDogs();
  }, [refreshDogs]);

  useEffect(() => {
    if (hasDog) router.replace('/(tabs)/home');
  }, [hasDog, router]);

  const submit = async () => {
    const parsed = dogSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Scrivi il nome e riprova.');
      return;
    }

    setError(null);
    try {
      if (usingMockGate) {
        markDogCreated('dog-rocky');
        router.replace('/(tabs)/home');
        return;
      }

      const dog = await createDog.mutateAsync(
        profileToCreateBody(
          {
            name: parsed.data.name,
            birthDate: null,
            sizeLabel: '',
            weightKg: null,
            sex: null,
            breedLabel: null,
            isMix: false,
            ageLabel: '',
          },
          `dog-create-${Date.now()}`,
        ),
      );
      markDogCreated(dog.id);

      if (parsed.data.photoUri) {
        // La foto arricchisce il profilo, ma non deve trattenere il primo
        // ingresso nell'app. Il salvataggio continua mentre si apre Home.
        void persistDogAvatar(dog.id, parsed.data.photoUri)
          .then(() => {
            if (userId) {
              void queryClient.invalidateQueries({
                queryKey: dogsQueryKey(userId),
              });
            }
          })
          .catch(() => {
            // La foto resta facoltativa: potrà essere aggiunta dal profilo.
          });
      }

      router.replace('/(tabs)/home');
    } catch (saveError) {
      const detail =
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'Controlla la connessione e riprova.';
      if (detail.includes('limited number of active dogs')) {
        setError(
          'Su questo account c’è già un cane. Puoi gestirlo dal suo profilo.',
        );
        void refreshDogs();
        return;
      }
      setError(`Non sono riuscito a creare il profilo. ${detail}`);
    }
  };

  return (
    <ScreenContainer scroll style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>INIZIAMO DAL VOSTRO MOMENTO</Text>
        </View>
        <Text style={styles.title}>Come si chiama il tuo cane?</Text>
        <Text style={styles.subtitle}>
          Partiamo da una cosa semplice. Il resto lo scopriremo insieme,
          osservandolo davvero.
        </Text>
      </View>

      <View style={styles.avatarSection}>
        <DogAvatar
          size={116}
          photoUri={draft.photoUri}
          dogName={draft.name || 'il tuo cane'}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiungi una foto del cane, facoltativa"
          onPress={async () => {
            const uri = await pickAvatarPhoto();
            if (uri) setDraft((current) => ({ ...current, photoUri: uri }));
          }}
          style={styles.photoAction}
        >
          <Ionicons name="camera-outline" size={17} color={colors.primary} />
          <Text style={styles.photoActionText}>
            {draft.photoUri ? 'Cambia foto' : 'Aggiungi una foto'}
          </Text>
          <Text style={styles.optional}>facoltativa</Text>
        </Pressable>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Il suo nome</Text>
        <TextInput
          value={draft.name}
          onChangeText={(name) => {
            setDraft((current) => ({ ...current, name }));
            if (error) setError(null);
          }}
          placeholder="Per esempio: Oreo"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          testID="onboarding-name"
        />
        <View style={styles.promiseRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          <Text style={styles.promise}>
            Ti aiuterò a capire cosa sta vivendo, un momento alla volta.
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button
        title={
          draft.name.trim()
            ? `Inizia a conoscere ${draft.name.trim()}`
            : 'Inizia a conoscerlo'
        }
        loading={createDog.isPending}
        onPress={() => void submit()}
        style={styles.submit}
        testID="onboarding-submit"
      />

      <Text style={styles.footer}>
        Potrai aggiungere età, razza e abitudini quando vorrai. Non devi sapere
        tutto adesso.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background },
  hero: { paddingTop: spacing.lg, gap: spacing.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    color: colors.accentPressed,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.1,
  },
  title: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.xxl,
    lineHeight: typography.size.xxl * 1.12,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  photoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoActionText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  optional: { color: colors.textMuted, fontSize: typography.size.xs },
  formCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.size.lg,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  promise: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  submit: { marginTop: spacing.xl },
  footer: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
});

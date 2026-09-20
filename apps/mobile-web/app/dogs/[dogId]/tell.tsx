import React, { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import Svg, { Rect } from 'react-native-svg';

import {
  Button,
  Card,
  ScreenContainer,
} from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import {
  confirmOwnerStory,
  discardOwnerStoryDraft,
  prepareOwnerStory,
  prepareOwnerStoryAudio,
  type OwnerFact,
  type OwnerStoryObservation,
} from '@/features/ownerStory/api';
import { StackScreenHeader } from '@/features/secondary/components';
import { queryKeys } from '@/lib/queryClient';

type Phase = 'compose' | 'review' | 'saved';

function VoiceWave({ active }: { active: boolean }) {
  const bars = [18, 28, 14, 36, 22, 40, 16, 30, 20, 34, 12, 26];
  return (
    <Svg width={120} height={48} viewBox="0 0 120 48" fill="none">
      {bars.map((height, index) => {
        const x = 4 + index * 10;
        const y = (48 - height) / 2;
        return (
          <Rect
            key={index}
            x={x}
            y={y}
            width={4}
            height={height}
            rx={2}
            fill={active ? colors.teal : '#B6E4E4'}
            opacity={active ? 0.95 : 0.7}
          />
        );
      })}
    </Svg>
  );
}

export default function TellDogScreen() {
  const { dogId = '' } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('compose');
  const [text, setText] = useState('');
  const [draftId, setDraftId] = useState('');
  const [facts, setFacts] = useState<OwnerFact[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useMock = usingMockGate;

  useEffect(() => {
    if (phase !== 'saved') return;
    const timer = setTimeout(() => router.back(), 1400);
    return () => clearTimeout(timer);
  }, [phase, router]);

  const applyDraft = (draft: {
    draft_id: string;
    transcript: string;
    facts: OwnerFact[];
  }) => {
    setDraftId(draft.draft_id);
    setText(draft.transcript);
    setFacts(draft.facts);
    setPhase('review');
  };

  const prepareText = async () => {
    if (text.trim().length < 3) return;
    setWorking(true);
    setError(null);
    try {
      if (useMock) {
        applyDraft({
          draft_id: 'owner-story-demo',
          transcript: text.trim(),
          facts: [
            {
              id: 'owner-fact-demo',
              category: 'GENERAL',
              statement: text.trim(),
              provenance: 'OWNER_REPORTED',
            },
          ],
        });
      } else {
        if (draftId) {
          await discardOwnerStoryDraft(dogId, draftId).catch(() => undefined);
        }
        applyDraft(await prepareOwnerStory(dogId, text.trim()));
      }
    } catch {
      setError('Non sono riuscito a preparare il racconto. Riprova.');
    } finally {
      setWorking(false);
    }
  };

  const toggleRecording = async () => {
    setError(null);
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        if (!recorder.uri) throw new Error('missing recording');
        const recordingUri = recorder.uri;
        try {
          if (useMock) {
            setError(
              'La trascrizione vocale usa il servizio reale. In questa anteprima puoi scrivere.',
            );
            return;
          }
          setWorking(true);
          const audioBase64 = await new File(recordingUri).base64();
          const contentType =
            Platform.OS === 'web'
              ? 'audio/webm'
              : Platform.OS === 'ios'
                ? 'audio/m4a'
                : 'audio/mp4';
          applyDraft(
            await prepareOwnerStoryAudio(dogId, audioBase64, contentType),
          );
        } finally {
          await deleteAsync(recordingUri, { idempotent: true }).catch(() => {
            // Il file temporaneo può essere già stato rimosso dal sistema.
          });
        }
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        if (permission.canAskAgain === false) {
          setError(
            'Il microfono è disattivato per Dogly. Attivalo nelle impostazioni e riprova.',
          );
          await Linking.openSettings();
        } else {
          setError('Per registrare serve il permesso del microfono.');
        }
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
    } catch {
      setError('Non sono riuscito a usare il microfono. Puoi scrivere qui sotto.');
    } finally {
      setWorking(false);
    }
  };

  const confirm = async () => {
    const validFacts = facts.filter((fact) => fact.statement.trim().length >= 2);
    if (validFacts.length === 0) {
      setError('Conserva almeno un’informazione prima di salvare.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      if (!useMock) {
        const confirmed = await confirmOwnerStory(dogId, draftId, validFacts);
        if (userId) {
          queryClient.setQueryData<OwnerStoryObservation[]>(
            queryKeys.ownerStories(userId, dogId),
            (current) => [
              {
                id: confirmed.observation_id,
                dog_id: dogId,
                facts: validFacts,
                confirmed_at: new Date().toISOString(),
              },
              ...(current ?? []).filter((story) => story.id !== confirmed.observation_id),
            ],
          );
          void queryClient.invalidateQueries({ queryKey: queryKeys.ownerStories(userId, dogId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeScore(userId, dogId) });
        }
      }
      setPhase('saved');
    } catch {
      setError('Non sono riuscito a salvare. Controlla e riprova.');
    } finally {
      setWorking(false);
    }
  };

  if (phase === 'saved') {
    return (
      <ScreenContainer contentStyle={styles.savedPage}>
        <View style={styles.savedIcon} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.savedTitle}>Salvato per {dog.name}</Text>
        <Text style={styles.savedText}>
          {useMock
            ? 'Questa è un’anteprima: il racconto non viene conservato.'
            : `Le informazioni che hai confermato sono state salvate correttamente.`}
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader
        title={
          phase === 'compose'
            ? `Racconta qualcosa su ${dog.name}`
            : 'Cosa vuoi che ricordi?'
        }
      />

      {phase === 'compose' ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Dimmi cosa hai notato</Text>
            <Text style={styles.heroSubtitle}>
              Parla oppure scrivi. Salverò soltanto ciò che confermi.
            </Text>
            <View style={styles.waveWrap}>
              <VoiceWave active={recorderState.isRecording} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                recorderState.isRecording
                  ? 'Ferma registrazione'
                  : 'Inizia registrazione'
              }
              onPress={() => void toggleRecording()}
              disabled={working}
              style={({ pressed }) => [
                styles.micButton,
                recorderState.isRecording && styles.micButtonRecording,
                pressed && styles.micPressed,
              ]}
            >
              <Ionicons
                name={recorderState.isRecording ? 'stop' : 'mic'}
                size={34}
                color="#FFFFFF"
              />
            </Pressable>
            <Text style={styles.micLabel}>
              {recorderState.isRecording
                ? `Sto ascoltando · ${Math.floor(recorderState.durationMillis / 1000)}s`
                : 'Tocca per raccontare'}
            </Text>
          </View>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>oppure scrivi</Text>
            <View style={styles.orLine} />
          </View>

          <TextInput
            accessibilityLabel={`Scrivi qualcosa su ${dog.name}`}
            value={text}
            onChangeText={setText}
            placeholder={`Per esempio: ${dog.name} al mattino preferisce passeggiare piano…`}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            style={styles.textArea}
          />
          <Button
            title="Continua"
            variant="secondary"
            loading={working}
            disabled={text.trim().length < 3 || recorderState.isRecording}
            onPress={() => void prepareText()}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>Cosa vuoi che ricordi?</Text>
          <Text style={styles.subtitle}>
            Controlla le informazioni, correggile oppure elimina quelle che non
            vuoi conservare.
          </Text>
          {facts.length === 0 ? (
            <Card style={styles.factCard}>
              <Text style={styles.emptyFactTitle}>
                Non ho trovato un ricordo su {dog.name}
              </Text>
              <Text style={styles.emptyFactText}>
                Saluti, domande e conversazioni generiche non vengono salvati.
                Raccontami invece qualcosa che hai notato su di lui.
              </Text>
            </Card>
          ) : null}
          {facts.map((fact) => (
            <Card key={fact.id} style={styles.factCard}>
              <View style={styles.factTop}>
                <View style={styles.sourcePill}>
                  <Ionicons name="person" size={13} color={colors.teal} />
                  <Text style={styles.sourceText}>Dal tuo racconto</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Elimina informazione"
                  onPress={() =>
                    setFacts((current) =>
                      current.filter((item) => item.id !== fact.id),
                    )
                  }
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
                </Pressable>
              </View>
              <TextInput
                value={fact.statement}
                onChangeText={(statement) =>
                  setFacts((current) =>
                    current.map((item) =>
                      item.id === fact.id ? { ...item, statement } : item,
                    ),
                  )
                }
                multiline
                maxLength={280}
                style={styles.factInput}
              />
            </Card>
          ))}
          {facts.some((fact) => fact.category === 'HEALTH') ? (
            <View style={styles.healthNotice} testID="owner-story-health-notice">
              <Ionicons
                name="medkit-outline"
                size={20}
                color={colors.warning}
              />
              <View style={styles.healthNoticeCopy}>
                <Text style={styles.healthNoticeTitle}>
                  Potrebbe essere utile parlarne con il veterinario
                </Text>
                <Text style={styles.healthNoticeText}>
                  Salvo ciò che hai raccontato, ma Dogly non può valutare una
                  causa medica. Se il cambiamento è nuovo, intenso o persiste,
                  chiedi un parere al veterinario.
                </Text>
              </View>
            </View>
          ) : null}
          <Button
            title={`Salva per ${dog.name}`}
            variant="secondary"
            loading={working}
            disabled={
              facts.length === 0 ||
              !facts.some((fact) => fact.statement.trim().length >= 2)
            }
            onPress={() => void confirm()}
          />
          <Button
            title="Modifica il racconto"
            variant="outline"
            onPress={() => setPhase('compose')}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.privacy}>
        La registrazione serve solo a capire il tuo racconto. Conservo
        esclusivamente le informazioni che scegli di salvare.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  heroTitle: {
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  waveWrap: {
    marginBottom: spacing.md,
  },
  title: {
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  micButton: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 44,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  micButtonRecording: {
    backgroundColor: colors.coral,
    shadowColor: colors.coral,
  },
  micPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  micLabel: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  orText: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
  },
  textArea: {
    minHeight: 132,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    color: '#1A2B48',
    fontSize: typography.size.md,
    textAlignVertical: 'top',
    ...shadows.card,
  },
  factCard: {
    gap: spacing.md,
    borderRadius: 20,
  },
  emptyFactTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  emptyFactText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  factTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.tealSoft,
  },
  sourceText: {
    color: colors.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  factInput: {
    minHeight: 64,
    color: '#1A2B48',
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    textAlignVertical: 'top',
  },
  healthNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.warningSoft,
  },
  healthNoticeCopy: {
    flex: 1,
  },
  healthNoticeTitle: {
    color: '#1A2B48',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  healthNoticeText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  error: {
    color: colors.danger,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  privacy: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  savedPage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  savedIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: colors.teal,
  },
  savedTitle: {
    color: '#1A2B48',
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  savedText: {
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
  },
});

import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';

import {
  Button,
  Card,
  DogIllustration,
  ScreenContainer,
} from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import {
  confirmOwnerStory,
  prepareOwnerStory,
  prepareOwnerStoryAudio,
  type OwnerFact,
} from '@/features/ownerStory/api';
import { StackScreenHeader } from '@/features/secondary/components';

type Phase = 'compose' | 'review' | 'saved';

export default function TellDogScreen() {
  const { dogId = '' } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('compose');
  const [text, setText] = useState('');
  const [draftId, setDraftId] = useState('');
  const [facts, setFacts] = useState<OwnerFact[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useMock = usingMockGate || !isApiConfigured();

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
        if (useMock) {
          setError(
            'La trascrizione vocale usa il servizio reale. In questa anteprima puoi scrivere.',
          );
          return;
        }
        setWorking(true);
        const audioBase64 = await new File(recorder.uri).base64();
        const contentType =
          Platform.OS === 'web'
            ? 'audio/webm'
            : Platform.OS === 'ios'
              ? 'audio/m4a'
              : 'audio/mp4';
        applyDraft(
          await prepareOwnerStoryAudio(dogId, audioBase64, contentType),
        );
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Per registrare serve il permesso del microfono.');
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
    if (validFacts.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      if (!useMock) {
        await confirmOwnerStory(dogId, draftId, validFacts);
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
        <DogIllustration mood="resting" size={210} />
        <Text style={styles.savedTitle}>Grazie, lo terrò a mente</Text>
        <Text style={styles.savedText}>
          Ho salvato solo ciò che hai confermato su {dog.name}.
        </Text>
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader
        title={
          phase === 'compose'
            ? `Dimmi qualcosa di ${dog.name}`
            : 'Controlla il racconto'
        }
      />

      {phase === 'compose' ? (
        <>
          <View style={styles.intro}>
            <DogIllustration mood="welcome" size={170} />
            <Text style={styles.title}>Cosa vuoi che sappia di {dog.name}?</Text>
            <Text style={styles.subtitle}>
              Puoi parlare oppure scrivere. Prima di salvare ti mostrerò ciò che
              ho capito.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recorderState.isRecording ? 'Ferma registrazione' : 'Inizia registrazione'
            }
            onPress={() => void toggleRecording()}
            disabled={working}
            style={[
              styles.micButton,
              recorderState.isRecording && styles.micButtonRecording,
            ]}
          >
            <Ionicons
              name={recorderState.isRecording ? 'stop' : 'mic'}
              size={30}
              color={colors.textOnPrimary}
            />
          </Pressable>
          <Text style={styles.micLabel}>
            {recorderState.isRecording
              ? `Sto ascoltando · ${Math.floor(recorderState.durationMillis / 1000)}s`
              : 'Tocca per raccontare'}
          </Text>

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
            loading={working}
            disabled={text.trim().length < 3 || recorderState.isRecording}
            onPress={() => void prepareText()}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>È questo che volevi dirmi?</Text>
          <Text style={styles.subtitle}>
            Puoi correggere o eliminare ogni informazione. Nulla è ancora
            salvato.
          </Text>
          {facts.map((fact) => (
            <Card key={fact.id} style={styles.factCard}>
              <View style={styles.factTop}>
                <View style={styles.sourcePill}>
                  <Ionicons name="person" size={13} color={colors.primary} />
                  <Text style={styles.sourceText}>Detto da te</Text>
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
          <Button
            title="Conferma e salva"
            loading={working}
            disabled={facts.length === 0}
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
        L’audio viene usato solo per la trascrizione e non diventa una memoria
        permanente.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
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
    width: 78,
    height: 78,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 39,
    backgroundColor: colors.primary,
  },
  micButtonRecording: {
    backgroundColor: colors.danger,
  },
  micLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
    textAlignVertical: 'top',
  },
  factCard: {
    gap: spacing.md,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  sourceText: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  factInput: {
    minHeight: 64,
    color: colors.text,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    textAlignVertical: 'top',
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
  savedTitle: {
    color: colors.text,
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

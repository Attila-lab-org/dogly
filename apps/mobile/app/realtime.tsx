import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useDoglyRealtime } from '@/features/realtime/useDoglyRealtime';

export default function RealtimeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const realtime = useDoglyRealtime(dog.id);
  const [text, setText] = useState('');
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, useNativeDriver: true }),
      ]),
    );
    if (['listening', 'speaking'].includes(realtime.voiceState)) animation.start();
    return () => animation.stop();
  }, [pulse, realtime.voiceState]);

  const active = ['connecting', 'listening', 'thinking', 'speaking'].includes(
    realtime.voiceState,
  );
  const ownerName = realtime.session?.owner_display_name?.trim().split(' ')[0];
  const status = {
    idle: ownerName ? `Ciao ${ownerName}` : 'Ciao, sono qui',
    connecting: 'Apro la conversazione…',
    listening: 'Ti ascolto',
    thinking: `Parliamo di ${dog.name}`,
    speaking: 'DOGly',
    error: `Sono ancora qui per ${dog.name}`,
  }[realtime.voiceState];

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    await realtime.sendText(value);
  };

  return (
    <LinearGradient colors={['#EFF7FF', '#FFFFFF']} style={styles.root}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable
            onPress={async () => {
              await realtime.disconnect();
              router.back();
            }}
            style={styles.close}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.identity}>
            <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={38} />
            <View>
              <Text style={styles.eyebrow}>DOGly conosce</Text>
              <Text style={styles.dogName}>{dog.name}</Text>
            </View>
          </View>
          <View style={styles.close} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.root}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{status}</Text>
            <Text style={styles.subtitle}>
              {realtime.voiceState === 'idle'
                ? `Parliamo di cani, e di ${dog.name}. Cosa vuoi capire oggi?`
                : realtime.voiceState === 'speaking'
                  ? `Ti rispondo di ${dog.name}.`
                  : realtime.voiceState === 'listening'
                    ? `Parla pure, ti ascolto.`
                    : `Possiamo parlare di ${dog.name}.`}
            </Text>
            <View style={styles.orbStage}>
              <Animated.View
                style={[
                  styles.halo,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.15, 0.48],
                    }),
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.92, 1.16],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Pressable onPress={active ? realtime.disconnect : realtime.connect}>
                <LinearGradient
                  colors={active ? ['#0066FF', '#31C8D9'] : ['#142E4A', '#0066FF']}
                  style={styles.orb}
                >
                  <Ionicons name={active ? 'radio' : 'mic'} size={38} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            </View>
            {active && (
              <View style={styles.liveActions}>
                <Pressable onPress={realtime.toggleMute} style={styles.mute}>
                  <Ionicons
                    name={realtime.muted ? 'mic-off' : 'mic'}
                    size={17}
                    color={colors.text}
                  />
                  <Text style={styles.muteText}>
                    {realtime.muted ? 'Riattiva microfono' : 'Silenzia'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void (async () => {
                      await realtime.disconnect();
                      router.replace('/behavior/capture');
                    })();
                  }}
                  style={styles.mute}
                >
                  <Ionicons name="videocam" size={17} color={colors.text} />
                  <Text style={styles.muteText}>Mostra un momento</Text>
                </Pressable>
              </View>
            )}

            {!!realtime.transcript && (
              <View style={styles.ownerBubble}>
                <Text style={styles.bodyText}>{realtime.transcript}</Text>
              </View>
            )}
            {!!(realtime.assistantDraft || realtime.lastTurn?.assistant_text) && (
              <View
                style={[
                  styles.answer,
                  realtime.lastTurn?.terminal_state === 'SAFETY_INTERRUPT' &&
                    styles.safety,
                ]}
              >
                <Text style={styles.answerLabel}>
                  {realtime.lastTurn?.terminal_state === 'SAFETY_INTERRUPT'
                    ? 'Da fare adesso'
                    : `Per ${dog.name}`}
                </Text>
                <Text style={styles.answerText}>
                  {realtime.assistantDraft || realtime.lastTurn?.assistant_text}
                </Text>
                {!!realtime.lastTurn?.question && (
                  <Text style={styles.question}>{realtime.lastTurn.question}</Text>
                )}
                {!!realtime.lastTurn?.behavior_handoff_href && (
                  <Pressable
                    onPress={() => {
                      void (async () => {
                        await realtime.disconnect();
                        router.replace('/behavior/capture');
                      })();
                    }}
                    style={styles.primaryButton}
                  >
                    <Ionicons name="videocam" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Mostrami il momento</Text>
                  </Pressable>
                )}
              </View>
            )}
            {!!realtime.lastTurn?.memory_proposal && (
              <View style={styles.memory}>
                <Text style={styles.memoryTitle}>Vuoi che lo ricordi?</Text>
                <Text style={styles.bodyText}>
                  {realtime.lastTurn.memory_proposal.statement}
                </Text>
                <View style={styles.memoryActions}>
                  <Pressable
                    onPress={() => realtime.decideMemory('CONFIRM')}
                    style={styles.primarySmall}
                  >
                    <Text style={styles.primaryButtonText}>Sì, ricordalo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => realtime.decideMemory('REJECT')}
                    style={styles.secondarySmall}
                  >
                    <Text style={styles.secondaryText}>No</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {!!realtime.error && <Text style={styles.error}>{realtime.error}</Text>}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              placeholder={`Scrivi a DOGly di ${dog.name}…`}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              maxLength={4000}
              style={styles.input}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim()}
              style={[styles.send, !text.trim() && styles.disabled]}
            >
              <Ionicons name="arrow-up" size={21} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  dogName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 130,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  orbStage: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: '#4C9DFF',
  },
  orb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
  },
  liveActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  mute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  muteText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  ownerBubble: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    backgroundColor: '#E7F0FF',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  answer: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E3EDFA',
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  safety: { backgroundColor: '#FFF8F8', borderColor: '#F6C7C7' },
  answerLabel: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  answerText: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  question: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 12 },
  bodyText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  primaryButton: {
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  memory: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#EDF6FF',
  },
  memoryTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  memoryActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primarySmall: {
    borderRadius: radius.md,
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondarySmall: {
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryText: { color: colors.text, fontWeight: '700' },
  error: { color: colors.danger, marginTop: spacing.md },
  composer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 15,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
  },
  disabled: { opacity: 0.35 },
});

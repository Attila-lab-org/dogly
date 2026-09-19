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
  const [text, setText] = useState('');
  const pulse = useRef(new Animated.Value(0)).current;
  const realtime = useDoglyRealtime(dog.id);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    if (realtime.voiceState === 'listening' || realtime.voiceState === 'speaking') {
      animation.start();
    }
    return () => animation.stop();
  }, [pulse, realtime.voiceState]);

  const close = async () => {
    await realtime.disconnect();
    router.back();
  };

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    await realtime.sendText(value);
  };

  const active =
    realtime.voiceState === 'listening' ||
    realtime.voiceState === 'thinking' ||
    realtime.voiceState === 'speaking' ||
    realtime.voiceState === 'connecting';
  const safety = realtime.lastTurn?.terminal_state === 'SAFETY_INTERRUPT';
  const ownerName = realtime.session?.owner_display_name?.trim().split(' ')[0];
  const statusLabel = {
    idle: ownerName ? `Ciao ${ownerName}` : `Ciao, sono qui`,
    connecting: 'Un attimo, apro la conversazione…',
    listening: 'Ti ascolto',
    thinking: `Parliamo di ${dog.name}`,
    speaking: 'DOGly',
    error: `Sono ancora qui per ${dog.name}`,
  }[realtime.voiceState];

  return (
    <LinearGradient colors={['#F0F8FF', '#F8FBFF', '#FFFFFF']} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Chiudi" onPress={close} style={styles.iconButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.identity}>
            <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={38} />
            <View>
              <Text style={styles.eyebrow}>DOGly conosce</Text>
              <Text style={styles.dogName}>{dog.name}</Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.conversation}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{statusLabel}</Text>
            <Text style={styles.subtitle}>
              {realtime.voiceState === 'idle'
                ? `Sono qui per te e ${dog.name}. Cosa vuoi capire oggi?`
                : realtime.voiceState === 'speaking'
                  ? `Ti rispondo di ${dog.name}.`
                  : realtime.voiceState === 'listening'
                    ? `Parla pure, ti ascolto.`
                    : `Possiamo parlare di ${dog.name}.`}
            </Text>

            <View style={styles.orbStage}>
              <Animated.View
                style={[
                  styles.orbHalo,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.18, 0.5],
                    }),
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.92, 1.15],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active ? 'Termina conversazione' : 'Parla con DOGly'}
                onPress={active ? realtime.disconnect : realtime.connect}
                disabled={!realtime.voiceSupported}
              >
                <LinearGradient
                  colors={
                    active
                      ? ['#0066FF', '#5B8CFF', '#31C8D9']
                      : ['#11253D', '#0066FF']
                  }
                  style={styles.orb}
                >
                  <Ionicons
                    name={active ? 'radio' : 'mic'}
                    color="#FFFFFF"
                    size={38}
                  />
                </LinearGradient>
              </Pressable>
            </View>

            {active && (
              <View style={styles.liveActions}>
                <Pressable onPress={realtime.toggleMute} style={styles.muteButton}>
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
                  onPress={() => router.push('/behavior/capture')}
                  style={styles.muteButton}
                >
                  <Ionicons name="videocam" size={17} color={colors.text} />
                  <Text style={styles.muteText}>Mostra un momento</Text>
                </Pressable>
              </View>
            )}

            {!!realtime.transcript && (
              <View style={styles.ownerBubble}>
                <Text style={styles.ownerText}>{realtime.transcript}</Text>
              </View>
            )}

            {!!(realtime.assistantDraft || realtime.lastTurn?.assistant_text) && (
              <View style={[styles.answerCard, safety && styles.safetyCard]}>
                <Text style={[styles.answerLabel, safety && styles.safetyLabel]}>
                  {safety ? 'Da fare adesso' : `Per ${dog.name}`}
                </Text>
                <Text style={styles.answerText}>
                  {realtime.assistantDraft || realtime.lastTurn?.assistant_text}
                </Text>
                {!!realtime.lastTurn?.question && (
                  <Text style={styles.questionText}>{realtime.lastTurn.question}</Text>
                )}
                {!!realtime.lastTurn?.behavior_handoff_href && (
                  <Pressable
                    onPress={() => router.push('/behavior/capture')}
                    style={styles.videoButton}
                  >
                    <Ionicons name="videocam" size={18} color="#FFFFFF" />
                    <Text style={styles.videoButtonText}>Mostrami il momento</Text>
                  </Pressable>
                )}
              </View>
            )}

            {!!realtime.lastTurn?.memory_proposal && (
              <View style={styles.memoryCard}>
                <View style={styles.memoryHeading}>
                  <Ionicons name="sparkles" size={18} color="#0066FF" />
                  <Text style={styles.memoryTitle}>Vuoi che lo ricordi?</Text>
                </View>
                <Text style={styles.memoryText}>
                  {realtime.lastTurn.memory_proposal.statement}
                </Text>
                <View style={styles.memoryActions}>
                  <Pressable
                    onPress={() => realtime.decideMemory('CONFIRM')}
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmText}>Sì, ricordalo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => realtime.decideMemory('REJECT')}
                    style={styles.rejectButton}
                  >
                    <Text style={styles.rejectText}>No</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!!realtime.error && <Text style={styles.errorText}>{realtime.error}</Text>}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              returnKeyType="send"
              placeholder={`Scrivi a DOGly di ${dog.name}…`}
              placeholderTextColor="#8E9CAE"
              style={styles.input}
              maxLength={4000}
            />
            <Pressable
              accessibilityLabel="Invia"
              onPress={send}
              disabled={!text.trim() || realtime.voiceState === 'connecting'}
              style={[styles.sendButton, !text.trim() && styles.sendDisabled]}
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
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  dogName: { fontSize: 16, color: colors.text, fontWeight: '800' },
  headerSpacer: { width: 42 },
  body: { flex: 1 },
  conversation: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 34,
    paddingBottom: 140,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 470,
    marginTop: 10,
  },
  orbStage: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  orbHalo: {
    position: 'absolute',
    width: 154,
    height: 154,
    borderRadius: 77,
    backgroundColor: '#4C9DFF',
  },
  orb: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 9,
  },
  liveActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  muteText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  ownerBubble: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    backgroundColor: '#E7F0FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  ownerText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  answerCard: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EDFA',
    shadowColor: '#123B68',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  safetyCard: { borderColor: '#F6C7C7', backgroundColor: '#FFF8F8' },
  answerLabel: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  safetyLabel: { color: '#C0392B' },
  answerText: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  questionText: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 12 },
  videoButton: {
    marginTop: 16,
    backgroundColor: '#0066FF',
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  videoButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  memoryCard: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#EDF6FF',
  },
  memoryHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  memoryTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  memoryText: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 8 },
  memoryActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  confirmButton: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  confirmText: { color: '#FFFFFF', fontWeight: '800' },
  rejectButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rejectText: { color: colors.text, fontWeight: '700' },
  errorText: { color: '#B73D32', fontSize: 14, marginTop: spacing.md },
  composer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E7EDF5',
  },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 15,
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
  },
  sendDisabled: { opacity: 0.35 },
});

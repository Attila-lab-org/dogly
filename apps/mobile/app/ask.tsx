import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { createRealtimeSession, createRealtimeTurn, decideRealtimeMemory, type MemoryProposal, type RealtimeSession, type RealtimeTurn } from '@/features/realtime/api';
import { queryKeys } from '@/lib/queryClient';

type Message = { id: string; role: 'user' | 'assistant'; text: string; turn?: RealtimeTurn; failed?: boolean };
const starterPool = [
  'Perché oggi si comporta così?',
  'Come posso aiutarlo a stare più tranquillo?',
  'Cosa dovrei osservare nei prossimi giorni?',
  'Che cosa sta cercando di comunicarmi?',
  'Come capisco se per lui è una situazione nuova?',
  'Qual è il modo migliore per accompagnarlo?',
  'Cosa posso fare oggi per aiutarlo?',
  'Come posso leggere meglio questo comportamento?',
  'Quando conviene chiedere un aiuto in più?',
];

export default function AskScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const starters = useMemo(() => {
    const day = Math.floor(Date.now() / 86400000);
    const offset = (day + dog.id.length) % starterPool.length;
    return [0, 1, 2].map((index) => starterPool[(offset + index) % starterPool.length]);
  }, [dog.id]);
  const scrollRef = useRef<ScrollView>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);
  const start = useCallback(async () => {
    if (!dog.id) return;
    setStarting(true); setError(null);
    try {
      const next = await createRealtimeSession(dog.id, 'TEXT');
      if (!mounted.current) return;
      setSession(next);
      setMessages([{ id: 'welcome-' + next.id, role: 'assistant', text: next.welcome_text }]);
    } catch { if (mounted.current) setError('Non riesco ad aprire la conversazione. Riprova tra poco.'); }
    finally { if (mounted.current) setStarting(false); }
  }, [dog.id]);
  useEffect(() => { void start(); }, [start]);
  useEffect(() => { const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40); return () => clearTimeout(timer); }, [messages, sending]);

  const send = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text || sending || !session) return;
    setDraft(''); setError(null);
    const localId = 'question-' + Date.now();
    setMessages((current) => [...current, { id: localId, role: 'user', text }]);
    setSending(true);
    try {
      const turn = await createRealtimeTurn(session.id, text, undefined, eventId ? { behaviorEventId: eventId } : undefined);
      if (!mounted.current) return;
      setMessages((current) => [...current, { id: turn.id, role: 'assistant', text: turn.assistant_text, turn }]);
    } catch {
      if (!mounted.current) return;
      setMessages((current) => [...current, { id: localId + '-error', role: 'assistant', text: 'Non sono riuscito a rispondere. Puoi riprovare senza perdere la domanda?', failed: true }]);
      setError('La risposta non è arrivata.');
    } finally { if (mounted.current) setSending(false); }
  }, [eventId, sending, session]);

  const decideMemory = async (proposal: MemoryProposal, action: 'CONFIRM' | 'REJECT') => {
    setMemoryBusy(proposal.id);
    try {
      await decideRealtimeMemory(proposal.id, action);
      if (action === 'CONFIRM' && userId) {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.ownerStories(userId, dog.id),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.knowledgeScore(userId, dog.id),
          }),
        ]);
      }
      setMessages((current) => current.map((item) => item.turn?.memory_proposal?.id === proposal.id ? { ...item, turn: item.turn ? { ...item.turn, memory_proposal: null } : undefined } : item));
    } catch { setError('Non ho salvato questa informazione. Riprova.'); }
    finally { setMemoryBusy(null); }
  };

  return <LinearGradient colors={['#EFF8FF', '#F8FBFF', '#FFFFFF']} style={styles.root}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Torna indietro" onPress={() => router.back()} style={styles.headerButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <View style={styles.headerIdentity}><DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={40} /><View><Text style={styles.eyebrow}>PARLA CON DOGLY</Text><Text style={styles.headerTitle}>Su {dog.name}</Text></View></View>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}><View style={styles.sparkle}><Ionicons name="sparkles" size={19} color={colors.primary} /></View><Text style={styles.introTitle}>Capire un momento alla volta</Text><Text style={styles.introText}>Scrivimi cosa hai notato. Ti rispondo in modo semplice, usando quello che so di {dog.name}.</Text></View>
          {starting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Preparo la conversazione…</Text></View> : null}
          {error && !sending ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void start()}><Text style={styles.retry}>Riprova</Text></Pressable></View> : null}
          {messages.map((message) => <View key={message.id} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
            <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.text}</Text>
              {message.failed ? <Pressable accessibilityRole="button" onPress={() => { setMessages((current) => current.filter((item) => item.id !== message.id)); void send(message.text); }} style={styles.retryInside}><Ionicons name="refresh" size={15} color={colors.primary} /><Text style={styles.retry}>Riprova</Text></Pressable> : null}
              {message.turn?.terminal_state === 'SAFETY_INTERRUPT' ? <Pressable accessibilityRole="button" onPress={() => router.push('/help' as never)} style={styles.helpLink}><Text style={styles.helpLinkText}>Apri l’assistenza</Text><Ionicons name="arrow-forward" size={15} color={colors.primary} /></Pressable> : null}
              {message.turn?.memory_proposal ? <View style={styles.memory}><Text style={styles.memoryLabel}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Tengo presente questa abitudine?' : 'Posso ricordare questa cosa?'}</Text><Text style={styles.memoryText}>{message.turn.memory_proposal.statement}</Text><View style={styles.memoryActions}><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'CONFIRM')} style={styles.memoryButton}><Text style={styles.memoryConfirm}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Sì, tienila presente' : 'Sì, ricordala'}</Text></Pressable><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'REJECT')}><Text style={styles.memoryReject}>Non ora</Text></Pressable></View></View> : null}
            </View>
          </View>)}
          {!starting && messages.length === 1 ? <View style={styles.starters}><Text style={styles.starterLabel}>Puoi iniziare da qui</Text>{starters.map((starter) => <Pressable key={starter} onPress={() => void send(starter)} style={styles.starter}><Text style={styles.starterText}>{starter}</Text><Ionicons name="arrow-up" size={16} color={colors.primary} /></Pressable>)}</View> : null}
          {sending ? <View style={styles.thinking}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.muted}>DOGly sta pensando…</Text></View> : null}
        </ScrollView>
        <View style={styles.composerWrap}><TextInput accessibilityLabel={'Scrivi una domanda su ' + dog.name} placeholder={'Cosa vuoi capire di ' + dog.name + '?'} placeholderTextColor={colors.textMuted} value={draft} onChangeText={(value) => setDraft(value.slice(0, 4000))} multiline maxLength={4000} editable={!starting && !sending && Boolean(session)} style={styles.input} onSubmitEditing={() => { if (Platform.OS !== 'web') void send(draft); }} /><Pressable accessibilityRole="button" accessibilityLabel="Invia domanda" onPress={() => void send(draft)} disabled={!draft.trim() || sending || !session} style={({ pressed }) => [styles.send, (!draft.trim() || sending || !session) && styles.sendDisabled, pressed && styles.pressed]}><Ionicons name="arrow-up" size={20} color="#FFFFFF" /></Pressable></View>
        <Text style={styles.disclaimer}>DOGly aiuta a leggere i comportamenti. Per sintomi o urgenze, contatta un veterinario.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1 }, header: { minHeight: 72, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.16)' }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, eyebrow: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 0.8 }, headerTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold }, body: { flex: 1 }, scroll: { flex: 1 }, conversation: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }, intro: { backgroundColor: 'rgba(255,255,255,0.84)', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(0,80,216,0.1)' }, sparkle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E6F1FF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, introTitle: { color: colors.text, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: spacing.xs }, introText: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: 22 }, loading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm }, muted: { color: colors.textMuted, fontSize: typography.size.sm }, error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FFF2F0' }, errorText: { color: colors.danger, flex: 1, fontSize: typography.size.sm }, retry: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, messageRow: { width: '100%', alignItems: 'flex-start' }, userRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: spacing.md }, assistantBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4EDF6', borderBottomLeftRadius: 6 }, userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 }, messageText: { color: colors.text, fontSize: typography.size.md, lineHeight: 23 }, userText: { color: '#FFFFFF' }, retryInside: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }, helpLink: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, helpLinkText: { color: colors.primary, fontWeight: typography.weight.bold }, memory: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: '#E4EDF6', paddingTop: spacing.md }, memoryLabel: { color: colors.text, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryText: { color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.size.sm, lineHeight: 19 }, memoryActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.md }, memoryButton: { backgroundColor: '#E6F1FF', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, memoryConfirm: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryReject: { color: colors.textMuted, fontWeight: typography.weight.semibold, fontSize: typography.size.sm }, starters: { gap: spacing.sm, marginTop: spacing.xs }, starterLabel: { color: colors.textMuted, fontSize: typography.size.sm, fontWeight: typography.weight.semibold }, starter: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7E6F4', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, starterText: { color: colors.textSecondary, fontSize: typography.size.sm, flex: 1 }, thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }, composerWrap: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7E6F4', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: typography.size.md }, send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, sendDisabled: { backgroundColor: '#B7C7DB' }, pressed: { opacity: 0.82 }, disclaimer: { width: '100%', maxWidth: 560, alignSelf: 'center', color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
});




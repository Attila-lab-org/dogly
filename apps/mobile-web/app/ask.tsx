import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { getOrCreateChatAttachmentsAlbum, getOrCreateMomentsAlbum, uploadAlbumPhoto } from '@/features/photos/api';
import { pickAlbumPhoto, takeConversationPhoto } from '@/features/photos/share';
import { readDeviceLocation } from '@/features/places/api';
import { pickConversationVideo } from '@/features/behavior/videoPicker';
import {
  enqueueAndUploadBehaviorClip,
  markUploadCompletedForEvent,
} from '@/features/behavior/upload';
import {
  getBehaviorEvent,
  isQuotaExhaustedError,
  isTerminalBehaviorStatus,
} from '@/features/behavior/api';
import {
  getDigestiveEvent,
  isFailedDigestiveStatus,
  isTerminalDigestiveStatus,
} from '@/features/digestive/api';
import { takeDigestivePhoto } from '@/features/digestive/photo';
import {
  enqueueAndUploadDigestivePhoto,
  markDigestiveUploadCompletedForEvent,
} from '@/features/digestive/upload';
import { removeFailedRetryPair } from '@/features/realtime/messageState';
import { rememberRealtimeSession, resumeRealtimeSession } from '@/features/realtime/sessionBridge';
import { purchasesEnabled } from '@/mocks/entitlements';
import { ANALYSIS_POLL_TIMEOUT_MS } from '@/features/core/processingTimeout';

import { readHomeMessage, takeHomeMessage } from '@/features/realtime/homeMessage';
import {
  startNativeDictation,
  startWebDictation,
  type DictationHandle,
} from '@/features/realtime/voiceDictation';

type Message = { id: string; role: 'user' | 'assistant'; text: string; turn?: RealtimeTurn; failed?: boolean; retryForId?: string; retryText?: string; retryAttachmentUri?: string; retryPhotoId?: string; retryRequestId?: string; attachmentUri?: string };

export default function AskScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ eventId?: string | string[]; source?: string | string[]; sessionId?: string | string[]; entryId?: string | string[]; intent?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const entryId = Array.isArray(params.entryId) ? params.entryId[0] : params.entryId;
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;
  const behaviorSource = source === 'behavior';
  const digestiveSource = source === 'digestive';
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(() => readHomeMessage(entryId, userId, dog.id) ?? '');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [mediaPhase, setMediaPhase] = useState<'uploading' | 'analyzing' | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<{
    eventId: string;
    source: 'behavior' | 'digestive';
  } | null>(null);
  const [focusedEventId, setFocusedEventId] = useState<string | undefined>(
    intent === 'analyzing' ? undefined : eventId,
  );
  const dictationRef = useRef<DictationHandle | null>(null);
  const analysisDoneRef = useRef<string | null>(null);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const [momentsBusy, setMomentsBusy] = useState<string | null>(null);
  const [savedToMoments, setSavedToMoments] = useState<Record<string, boolean>>({});
  const latestAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const digestPhotoHint = /feci|cacca|digest|pup[uù]|diarrea|escrement|foto chiara/i.test(
    `${latestAssistant?.turn?.media_prompt ?? ''} ${latestAssistant?.text ?? ''}`,
  );
  const needsDigestivePhoto =
    intent === 'digest' ||
    Boolean(latestAssistant?.turn?.domains?.includes('DIGESTIVE')) ||
    digestPhotoHint;
  const videoHint = /breve video|mandami un video|fammi vedere|videocamera|carica un video/i.test(
    latestAssistant?.text ?? '',
  );
  const analyzing = mediaPhase === 'analyzing' || Boolean(pendingAnalysis);
  const neededMedia: 'PHOTO' | 'VIDEO' | null =
    analyzing || sending
      ? null
      : latestAssistant?.turn?.media_invite === 'PHOTO' ||
          latestAssistant?.turn?.media_invite === 'VIDEO'
        ? latestAssistant.turn.media_invite
        : intent === 'digest' && messages.length > 0 && !starting
          ? 'PHOTO'
          : digestPhotoHint
            ? 'PHOTO'
            : videoHint
              ? 'VIDEO'
              : null;
  const scrollRef = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const startedKey = useRef<string | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const start = useCallback(async () => {
    if (!dog.id) return;
    const key = `${dog.id}:${eventId ?? 'free'}:${sessionId ?? 'new'}:${intent ?? ''}:${source ?? ''}`;
    if (startedKey.current === key) return;
    startedKey.current = key;
    setStarting(true); setError(null);
    let resumedHandoff: { session: RealtimeSession; messages: Message[] } | null = null;
    try {
      const resumed = sessionId ? await resumeRealtimeSession<Message>(sessionId, dog.id) : null;
      resumedHandoff = resumed;
      if (sessionId && !resumed) throw new Error('Conversation unavailable');
      const next = resumed?.session ?? await createRealtimeSession(dog.id);
      if (!mounted.current) return;
      setSession(next);
      const digestiveHandoff = source === 'digestive';
      if (eventId && intent === 'analyzing') {
        const text = digestiveHandoff
          ? 'Ho caricato la foto richiesta.'
          : 'Ho caricato il video richiesto.';
        setMessages([
          ...(resumed?.messages ?? []),
          { id: 'video-' + eventId, role: 'user', text },
        ]);
        setMediaPhase('analyzing');
        setPendingAnalysis({
          eventId,
          source: digestiveHandoff ? 'digestive' : 'behavior',
        });
      } else if (eventId) {
        const isRevisit = intent === 'revisit';
        const text = isRevisit
          ? digestiveHandoff
            ? 'Torniamo su questo controllo.'
            : 'Torniamo su questo momento.'
          : digestiveHandoff
            ? 'Ho caricato la foto richiesta.'
            : 'Ho caricato il video richiesto.';
        const turn = await createRealtimeTurn(next.id, text, undefined, {
          eventId,
          source: digestiveHandoff ? 'digestive' : 'behavior',
        });
        if (!mounted.current) return;
        setMessages([
          ...(resumed?.messages ?? []),
          { id: 'video-' + eventId, role: 'user', text },
          { id: turn.id, role: 'assistant', text: turn.assistant_text, turn },
        ]);
        setFocusedEventId(undefined);
      } else if (resumed) {
        setMessages(resumed.messages);
      } else {
        const welcome =
          intent === 'digest'
            ? `Se vuoi controllare la digestione di ${dog.name}, mandami una foto chiara delle feci e ne parliamo qui.`
            : next.welcome_text;
        setMessages([{ id: 'welcome-' + next.id, role: 'assistant', text: welcome }]);
      }
    } catch {
      startedKey.current = null;
      if (resumedHandoff) await rememberRealtimeSession(resumedHandoff.session, resumedHandoff.messages);
      if (mounted.current) setError('Non riesco ad aprire la conversazione. Riprova tra poco.');
    }
    finally { if (mounted.current) setStarting(false); }
  }, [dog.id, dog.name, eventId, intent, sessionId, source]);
  useEffect(() => { void start(); }, [start]);
  useEffect(() => { const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40); return () => clearTimeout(timer); }, [messages, sending, mediaPhase]);

  useEffect(() => {
    if (!pendingAnalysis || !session || starting) return;
    if (analysisDoneRef.current === pendingAnalysis.eventId) return;
    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      while (!cancelled && mounted.current) {
        if (Date.now() - startedAt > ANALYSIS_POLL_TIMEOUT_MS) {
          setMediaPhase(null);
          setPendingAnalysis(null);
          setError('L’analisi sta impiegando troppo. Riprova tra poco dalla chat.');
          return;
        }
        try {
          if (pendingAnalysis.source === 'digestive') {
            const event = await getDigestiveEvent(pendingAnalysis.eventId);
            if (!isTerminalDigestiveStatus(event.status)) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            markDigestiveUploadCompletedForEvent(pendingAnalysis.eventId);
            if (isFailedDigestiveStatus(event.status)) {
              if (cancelled || !mounted.current) return;
              setMediaPhase(null);
              setPendingAnalysis(null);
              setMessages((current) => [
                ...current,
                {
                  id: 'analyze-fail-' + pendingAnalysis.eventId,
                  role: 'assistant',
                  text: 'Non sono riuscito a leggere questa foto. Puoi scattarne un’altra più chiara?',
                },
              ]);
              return;
            }
          } else {
            const event = await getBehaviorEvent(pendingAnalysis.eventId);
            if (!isTerminalBehaviorStatus(event.status)) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            markUploadCompletedForEvent(pendingAnalysis.eventId);
            if (
              event.status === 'FAILED_TERMINAL' ||
              event.status === 'CANCELLED'
            ) {
              if (cancelled || !mounted.current) return;
              setMediaPhase(null);
              setPendingAnalysis(null);
              setMessages((current) => [
                ...current,
                {
                  id: 'analyze-fail-' + pendingAnalysis.eventId,
                  role: 'assistant',
                  text: 'Non sono riuscito a leggere questo video. Puoi riprovare dalla chat?',
                },
              ]);
              return;
            }
          }
          if (cancelled || !mounted.current) return;
          analysisDoneRef.current = pendingAnalysis.eventId;
          const digestive = pendingAnalysis.source === 'digestive';
          const text = digestive
            ? 'Ho caricato la foto richiesta.'
            : 'Ho caricato il video richiesto.';
          setSending(true);
          const turn = await createRealtimeTurn(session.id, text, undefined, {
            eventId: pendingAnalysis.eventId,
            source: pendingAnalysis.source,
          });
          if (!mounted.current) return;
          setMessages((current) => {
            const hasUserUpload = current.some(
              (item) =>
                item.role === 'user' &&
                (item.id === 'video-' + pendingAnalysis.eventId ||
                  item.id.startsWith('digest-up-') ||
                  item.id.startsWith('video-up-')),
            );
            return [
              ...current,
              ...(hasUserUpload
                ? []
                : [
                    {
                      id: 'video-' + pendingAnalysis.eventId,
                      role: 'user' as const,
                      text,
                    },
                  ]),
              {
                id: turn.id,
                role: 'assistant',
                text: turn.assistant_text,
                turn,
              },
            ];
          });
          setMediaPhase(null);
          setPendingAnalysis(null);
          setSending(false);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [pendingAnalysis, session, starting]);

  const send = useCallback(async (value: string, attachment?: { uri: string; purpose: string }, existingPhotoId?: string, existingRequestId?: string) => {
    const text = value.trim();
    if (!text || sending || !session) return;
    setDraft(''); setError(null);
    const localId = 'question-' + Date.now();
    const requestId = existingRequestId ?? `${localId}-${Math.random().toString(36).slice(2)}`;
    setMessages((current) => [...current, { id: localId, role: 'user', text, attachmentUri: attachment?.uri }]);
    setSending(true);
    setMediaPhase(existingPhotoId ? 'analyzing' : attachment ? 'uploading' : null);
    let photoId: string | undefined = existingPhotoId;
    try {
      if (attachment && !photoId) {
        // Chat attachments (incl. digestione) must NOT enter Momenti.
        const album = await getOrCreateChatAttachmentsAlbum(dog.id);
        const photo = await uploadAlbumPhoto(album.id, attachment.uri, {
          caption: attachment.purpose,
          visibility: 'PRIVATE',
        });
        photoId = photo.id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-album', album.id] }),
        ]);
        setMediaPhase('analyzing');
      }
      const location = await readDeviceLocation();
      const turn = await createRealtimeTurn(
        session.id,
        text,
        undefined,
        {
          idempotencyKey: requestId,
          eventId: focusedEventId,
          source: behaviorSource ? 'behavior' : digestiveSource ? 'digestive' : undefined,
          photoId,
          photoContext: attachment?.purpose,
          latitude: location?.lat,
          longitude: location?.lng,
        },
      );
      if (focusedEventId) setFocusedEventId(undefined);
      if (!mounted.current) return;
      setMessages((current) => [...current, { id: turn.id, role: 'assistant', text: turn.assistant_text, turn }]);
    } catch {
      if (!mounted.current) return;
      setMessages((current) => [...current, { id: localId + '-error', role: 'assistant', text: attachment || photoId ? 'Non sono riuscito a leggere questo momento. Puoi riprovare?' : 'Non sono riuscito a ricevere una risposta. Puoi riprovare?', failed: true, retryForId: localId, retryText: text, retryAttachmentUri: attachment?.uri, retryPhotoId: photoId, retryRequestId: requestId }]);
      setError('La risposta non è arrivata.');
    } finally { if (mounted.current) { setSending(false); setMediaPhase(null); } }
  }, [behaviorSource, digestiveSource, dog.id, focusedEventId, sending, session, queryClient]);

  // Claim only once after a session is ready; failures use the normal retry UI.
  useEffect(() => {
    if (starting || sending || !session || session.dog_id !== dog.id) return;
    const text = takeHomeMessage(entryId, userId, dog.id);
    if (text) void send(text);
  }, [dog.id, entryId, send, sending, session, starting, userId]);

  const captureDigestiveFromChat = useCallback(async () => {
    if (sending || analyzing || !session || !userId || !dog.id) return;
    setError(null);
    setMediaPhase('uploading');
    try {
      const uri = await takeDigestivePhoto();
      if (!uri) {
        setMediaPhase(null);
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: 'digest-up-' + Date.now(),
          role: 'user',
          text: 'Ho caricato la foto richiesta.',
          attachmentUri: uri,
        },
      ]);
      if (usingMockGate) {
        setMediaPhase('analyzing');
        await new Promise((r) => setTimeout(r, 1200));
        setMediaPhase(null);
        setMessages((current) => [
          ...current,
          {
            id: 'digest-mock-' + Date.now(),
            role: 'assistant',
            text: `Ho guardato la foto. Dimmi pure cosa vuoi approfondire sulla digestione di ${dog.name}.`,
          },
        ]);
        return;
      }
      const { eventId: digestiveEventId } = await enqueueAndUploadDigestivePhoto({
        userId,
        dogId: dog.id,
        localUri: uri,
      });
      if (!mounted.current) return;
      setMediaPhase('analyzing');
      setPendingAnalysis({ eventId: digestiveEventId, source: 'digestive' });
      await rememberRealtimeSession(session, messages);
    } catch (err) {
      setMediaPhase(null);
      if (isQuotaExhaustedError(err) && purchasesEnabled) {
        router.replace('/paywall');
        return;
      }
      setError('Non sono riuscito a scattare o caricare la foto. Riprova.');
    }
  }, [
    analyzing,
    dog.id,
    dog.name,
    messages,
    router,
    sending,
    session,
    userId,
    usingMockGate,
  ]);

  const sharePhoto = useCallback(async () => {
    const turn = latestAssistant?.turn;
    if (sending || !session) return;
    if (needsDigestivePhoto) {
      await captureDigestiveFromChat();
      return;
    }
    const uri = await takeConversationPhoto();
    if (!uri) return;
    const purpose = turn?.media_prompt || 'Ti mostro questo momento';
    void send(purpose, { uri, purpose });
  }, [
    captureDigestiveFromChat,
    latestAssistant,
    needsDigestivePhoto,
    send,
    sending,
    session,
  ]);

  const pickPhoto = useCallback(async () => {
    if (sending || !session) return;
    if (needsDigestivePhoto) {
      await captureDigestiveFromChat();
      return;
    }
    const uri = await pickAlbumPhoto();
    if (!uri) return;
    const purpose = latestAssistant?.turn?.media_prompt || 'Ti mostro questo momento';
    void send(purpose, { uri, purpose });
  }, [
    captureDigestiveFromChat,
    latestAssistant,
    needsDigestivePhoto,
    send,
    sending,
    session,
  ]);

  const beginBehaviorAnalysis = useCallback(
    async (input: {
      localUri: string;
      durationMs: number;
      hasAudio: boolean;
      contentType?: string;
    }) => {
      if (!session || !userId || !dog.id) return;
      setError(null);
      setMediaPhase('uploading');
      setMessages((current) => [
        ...current,
        {
          id: 'video-up-' + Date.now(),
          role: 'user',
          text: 'Ho caricato il video richiesto.',
        },
      ]);
      try {
        if (usingMockGate) {
          setMediaPhase('analyzing');
          await new Promise((r) => setTimeout(r, 1200));
          setMediaPhase(null);
          setMessages((current) => [
            ...current,
            {
              id: 'video-mock-' + Date.now(),
              role: 'assistant',
              text: `Ho guardato il video di ${dog.name}. Dimmi pure cosa vuoi approfondire.`,
            },
          ]);
          return;
        }
        const { eventId: behaviorEventId } = await enqueueAndUploadBehaviorClip({
          userId,
          dogId: dog.id,
          localUri: input.localUri,
          durationMs: input.durationMs,
          hasAudio: input.hasAudio,
          contentType: input.contentType,
        });
        if (!mounted.current) return;
        setMediaPhase('analyzing');
        setPendingAnalysis({ eventId: behaviorEventId, source: 'behavior' });
        await rememberRealtimeSession(session, messages);
      } catch (err) {
        setMediaPhase(null);
        if (isQuotaExhaustedError(err) && purchasesEnabled) {
          router.replace('/paywall');
          return;
        }
        setError('Non sono riuscito a caricare il video. Riprova.');
      }
    },
    [dog.id, dog.name, messages, router, session, userId, usingMockGate],
  );

  const pickVideo = useCallback(async () => {
    if (sending || analyzing || !session) return;
    const picked = await pickConversationVideo();
    if (!picked) return;
    await beginBehaviorAnalysis({
      localUri: picked.uri,
      durationMs: picked.durationMs,
      hasAudio: picked.hasAudio,
      contentType: picked.contentType,
    });
  }, [analyzing, beginBehaviorAnalysis, sending, session]);

  const openVideoCapture = useCallback(async () => {
    if (sending || analyzing || !session) return;
    await rememberRealtimeSession(session, messages);
    // Dopo lo scatto, uploading torna in Ask con intent=analyzing (niente processing).
    router.push({
      pathname: '/behavior/capture',
      params: { from: 'ask', sessionId: session.id },
    } as never);
  }, [analyzing, messages, router, sending, session]);

  const appendTranscript = useCallback((text: string) => {
    setDraft((current) => `${current}${current ? ' ' : ''}${text}`.slice(0, 4000));
  }, []);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setDictating(false);
      return;
    }
    const handlers = {
      onTranscript: appendTranscript,
      onError: (message: string) => {
        setDictating(false);
        dictationRef.current = null;
        setError(message);
      },
      onStateChange: (recording: boolean) => {
        setDictating(recording);
        if (!recording) dictationRef.current = null;
      },
    };
    if (Platform.OS === 'web') {
      const handle = startWebDictation(handlers);
      if (!handle) {
        setDictating(false);
        return;
      }
      dictationRef.current = handle;
      setDictating(true);
      return;
    }
    setDictating(true);
    void startNativeDictation(handlers).then((handle) => {
      if (!handle) {
        setDictating(false);
        return;
      }
      dictationRef.current = handle;
    });
  }, [appendTranscript, dictating]);

  const intentHandled = useRef(false);
  useEffect(() => {
    if (starting || !session || intentHandled.current) return;
    if (intent === 'photo') {
      intentHandled.current = true;
      void pickAlbumPhoto().then((uri) => {
        if (!uri) return;
        void send('Ti mostro questo momento', { uri, purpose: 'Ti mostro questo momento' });
      });
    } else if (intent === 'voice') {
      intentHandled.current = true;
      setTimeout(() => toggleDictation(), 400);
    }
  }, [intent, send, session, starting, toggleDictation]);

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

  const saveAttachmentToMoments = async (messageId: string, uri: string) => {
    setMomentsBusy(messageId);
    try {
      const album = await getOrCreateMomentsAlbum(dog.id);
      await uploadAlbumPhoto(album.id, uri, { caption: `Ricordo di ${dog.name}`, visibility: 'PRIVATE' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
        queryClient.invalidateQueries({ queryKey: ['dog-photos', dog.id] }),
      ]);
      setSavedToMoments((current) => ({ ...current, [messageId]: true }));
    } catch {
      setError('Non sono riuscito a salvare la foto nei Momenti.');
    } finally {
      setMomentsBusy(null);
    }
  };

  const priorUserAttachmentUri = (assistantIndex: number) => {
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === 'user' && candidate.attachmentUri) return candidate.attachmentUri;
      if (candidate?.role === 'user') break;
    }
    return undefined;
  };

  return <LinearGradient colors={['#EFF8FF', '#F8FBFF', '#FFFFFF']} style={styles.root}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Torna alla Home" onPress={() => router.replace('/(tabs)/home' as never)} style={styles.headerButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <View style={styles.headerIdentity}><DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={40} /><View><Text style={styles.eyebrow}>PARLA CON DOGLY</Text><Text style={styles.headerTitle}>Su {dog.name}</Text></View></View>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.modeRow} accessibilityRole="tablist">
        <View style={[styles.modePill, styles.modePillActive]} accessibilityState={{ selected: true }}>
          <Text style={styles.modePillTextActive}>Testo</Text>
        </View>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Passa a conversazione Voce"
          accessibilityState={{ selected: false }}
          onPress={() => router.push('/ask/live' as never)}
          style={({ pressed }) => [styles.modePill, pressed && styles.pressed]}
        >
          <Ionicons name="mic-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.modePillText}>Voce</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
          {starting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Preparo la conversazione…</Text></View> : null}
          {error && !sending ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void start()}><Text style={styles.retry}>Riprova</Text></Pressable></View> : null}
          {messages.map((message, messageIndex) => <View key={message.id} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
            <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.text}</Text>
              {message.attachmentUri ? <Image source={{ uri: message.attachmentUri }} style={styles.messageAttachment} accessibilityLabel="Foto condivisa nella conversazione" /> : null}
              {message.failed ? <Pressable accessibilityRole="button" onPress={() => { setMessages((current) => removeFailedRetryPair(current, message.id)); void send(message.retryText ?? '', message.retryAttachmentUri ? { uri: message.retryAttachmentUri, purpose: message.retryText ?? 'Foto condivisa nella conversazione' } : undefined, message.retryPhotoId, message.retryRequestId); }} style={styles.retryInside}><Ionicons name="refresh" size={15} color={colors.primary} /><Text style={styles.retry}>Riprova</Text></Pressable> : null}
              {message.turn?.terminal_state === 'SAFETY_INTERRUPT' ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/help', params: { returnTo: 'ask' } } as never)} style={styles.helpLink}><Text style={styles.helpLinkText}>Apri l’assistenza</Text><Ionicons name="arrow-forward" size={15} color={colors.primary} /></Pressable> : null}
              {!sending && message.id === latestAssistantId && message.turn?.question_options?.length ? <View style={styles.questionOptions}>{message.turn.question_options.map((option) => <Pressable key={option} accessibilityRole="button" onPress={() => void send(option)} disabled={sending} style={({ pressed }) => [styles.questionOption, pressed && styles.pressed]}><Text style={styles.questionOptionText}>{option}</Text><Ionicons name="arrow-up" size={14} color={colors.primary} /></Pressable>)}</View> : null}
              {!sending && message.id === latestAssistantId && neededMedia === 'PHOTO' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    message.turn?.media_prompt ||
                    (needsDigestivePhoto
                      ? `Scatta una foto per la digestione di ${dog.name}`
                      : `Mostrami ${dog.name} in una foto`)
                  }
                  onPress={() => void sharePhoto()}
                  style={({ pressed }) => [styles.mediaCta, styles.mediaCtaPulse, pressed && styles.pressed]}
                >
                  <View style={styles.mediaIcon}>
                    <Ionicons name="camera" size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.mediaTitle}>
                    {needsDigestivePhoto ? 'Scatta la foto' : 'Apri la fotocamera'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {!sending && message.id === latestAssistantId && neededMedia === 'VIDEO' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    message.turn?.media_prompt || 'Mostrami questo momento in un video'
                  }
                  onPress={() => void openVideoCapture()}
                  style={({ pressed }) => [styles.mediaCta, styles.mediaCtaPulse, pressed && styles.pressed]}
                >
                  <View style={styles.mediaIcon}>
                    <Ionicons name="videocam" size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.mediaTitle}>Apri la videocamera</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {!sending && message.id === latestAssistantId && message.turn?.food_review_href ? <Pressable accessibilityRole="button" accessibilityLabel="Apri alimentazione" onPress={() => router.push('/nutrition/foods' as never)} style={({ pressed }) => [styles.mediaCta, pressed && styles.pressed]}><View style={styles.mediaIcon}><Ionicons name="nutrition-outline" size={17} color={colors.primary} /></View><Text style={styles.mediaTitle}>Rivedi l’alimento</Text><Ionicons name="chevron-forward" size={16} color={colors.primary} /></Pressable> : null}
              {!sending && message.id === latestAssistantId && message.turn?.save_to_moments_suggested && !savedToMoments[message.id] ? (() => { const uri = priorUserAttachmentUri(messageIndex); return uri ? <Pressable accessibilityRole="button" accessibilityLabel="Salva nei Momenti" disabled={momentsBusy === message.id} onPress={() => void saveAttachmentToMoments(message.id, uri)} style={({ pressed }) => [styles.mediaCta, pressed && styles.pressed]}><View style={styles.mediaIcon}><Ionicons name="images-outline" size={17} color={colors.primary} /></View><Text style={styles.mediaTitle}>{momentsBusy === message.id ? 'Salvo…' : 'Salva nei Momenti'}</Text><Ionicons name="chevron-forward" size={16} color={colors.primary} /></Pressable> : null; })() : null}
              {savedToMoments[message.id] ? <Text style={styles.savedNote}>Salvata nei Momenti</Text> : null}
              {message.turn?.memory_proposal ? <View style={styles.memory}><Text style={styles.memoryLabel}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Tengo presente questa abitudine?' : 'Posso ricordare questa cosa?'}</Text><Text style={styles.memoryText}>{message.turn.memory_proposal.statement}</Text><View style={styles.memoryActions}><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'CONFIRM')} style={styles.memoryButton}><Text style={styles.memoryConfirm}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Sì, tienila presente' : 'Sì, ricordala'}</Text></Pressable><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'REJECT')}><Text style={styles.memoryReject}>Non ora</Text></Pressable></View></View> : null}
            </View>
          </View>)}
          {sending || mediaPhase ? (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.muted}>
                {mediaPhase === 'uploading'
                  ? 'Carico il momento…'
                  : mediaPhase === 'analyzing'
                    ? 'Sto analizzando…'
                    : 'DOGly sta pensando…'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.composerWrap}>
          <TextInput
            accessibilityLabel={'Scrivi a DOGly di ' + dog.name}
            placeholder={'Raccontami di ' + dog.name + '…'}
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={(value) => setDraft(value.slice(0, 4000))}
            multiline
            maxLength={4000}
            editable={!starting && !sending && !analyzing && Boolean(session)}
            style={styles.input}
            onSubmitEditing={() => { if (Platform.OS !== 'web') void send(draft); }}
          />
          <View style={styles.composerTools}>
            <View style={styles.composerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  neededMedia === 'PHOTO'
                    ? 'Apri la fotocamera'
                    : 'Scegli una foto dalla galleria'
                }
                onPress={() =>
                  void (neededMedia === 'PHOTO' ? sharePhoto() : pickPhoto())
                }
                disabled={sending || !session}
                style={({ pressed }) => [
                  styles.mediaButton,
                  neededMedia === 'PHOTO' && styles.mediaButtonLit,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={neededMedia === 'PHOTO' ? 'camera' : 'images-outline'}
                  size={20}
                  color={neededMedia === 'PHOTO' ? '#FFFFFF' : colors.primary}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  neededMedia === 'VIDEO'
                    ? 'Apri la videocamera'
                    : 'Scegli un video dalla galleria'
                }
                onPress={() =>
                  void (neededMedia === 'VIDEO' ? openVideoCapture() : pickVideo())
                }
                disabled={sending || !session}
                style={({ pressed }) => [
                  styles.mediaButton,
                  neededMedia === 'VIDEO' && styles.mediaButtonLit,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={neededMedia === 'VIDEO' ? 'videocam' : 'videocam-outline'}
                  size={20}
                  color={neededMedia === 'VIDEO' ? '#FFFFFF' : colors.primary}
                />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={dictating ? 'Ferma dettatura' : 'Detta un messaggio'} onPress={toggleDictation} disabled={sending || !session} style={({ pressed }) => [styles.mic, dictating && styles.micActive, pressed && styles.pressed]}>
                <Ionicons name={dictating ? 'mic' : 'mic-outline'} size={19} color={dictating ? '#FFFFFF' : colors.primary} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Invia messaggio" onPress={() => void send(draft)} disabled={!draft.trim() || sending || !session} style={({ pressed }) => [styles.send, (!draft.trim() || sending || !session) && styles.sendDisabled, pressed && styles.pressed]}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        <Text style={styles.disclaimer}>DOGly aiuta a leggere i comportamenti. Per sintomi o urgenze, contatta un veterinario.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1 }, header: { minHeight: 72, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.16)' }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, eyebrow: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 0.8 }, headerTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold }, modeRow: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 4, marginTop: spacing.sm, marginBottom: spacing.xs, padding: 4, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(148,163,184,0.18)' }, modePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 }, modePillActive: { backgroundColor: colors.primary }, modePillText: { color: colors.textSecondary, fontWeight: typography.weight.semibold, fontSize: typography.size.sm }, modePillTextActive: { color: '#FFFFFF', fontWeight: typography.weight.bold, fontSize: typography.size.sm }, body: { flex: 1 }, scroll: { flex: 1 }, conversation: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }, intro: { backgroundColor: 'rgba(255,255,255,0.84)', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(0,80,216,0.1)' }, sparkle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E6F1FF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, introTitle: { color: colors.text, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: spacing.xs }, introText: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: 22 }, loading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm }, muted: { color: colors.textMuted, fontSize: typography.size.sm }, error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FFF2F0' }, errorText: { color: colors.danger, flex: 1, fontSize: typography.size.sm }, retry: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, messageRow: { width: '100%', alignItems: 'flex-start' }, userRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: spacing.md }, assistantBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4EDF6', borderBottomLeftRadius: 6 }, userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 }, messageText: { color: colors.text, fontSize: typography.size.md, lineHeight: 23 }, userText: { color: '#FFFFFF' }, retryInside: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }, helpLink: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, helpLinkText: { color: colors.primary, fontWeight: typography.weight.bold }, memory: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: '#E4EDF6', paddingTop: spacing.md }, memoryLabel: { color: colors.text, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryText: { color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.size.sm, lineHeight: 19 }, memoryActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.md }, memoryButton: { backgroundColor: '#E6F1FF', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, memoryConfirm: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryReject: { color: colors.textMuted, fontWeight: typography.weight.semibold, fontSize: typography.size.sm }, thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  composerWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    width: '100%',
    minHeight: 56,
    maxHeight: 140,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7E6F4',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.text,
    fontSize: typography.size.md,
    lineHeight: 22,
  },
  composerTools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mic: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6F1FF' },
  micActive: { backgroundColor: colors.primary },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendDisabled: { backgroundColor: '#B7C7DB' },
  pressed: { opacity: 0.82 },
  disclaimer: { width: '100%', maxWidth: 560, alignSelf: 'center', color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  mediaButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6F1FF',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mediaButtonLit: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  questionOptions: { marginTop: spacing.md, gap: spacing.xs }, questionOption: { minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#D7E6F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, questionOptionText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.sm },
  messageAttachment: { width: 220, height: 160, borderRadius: radius.md, marginBottom: spacing.sm, resizeMode: 'cover' },
  mediaCta: {
    marginTop: spacing.md,
    minHeight: 48,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: '#E6F1FF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mediaCtaPulse: {
    backgroundColor: '#D7EBFF',
  },
  mediaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTitle: {
    flex: 1,
    color: colors.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  savedNote: { marginTop: spacing.sm, color: colors.textMuted, fontSize: typography.size.sm },
});

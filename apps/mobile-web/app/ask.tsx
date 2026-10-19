import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
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
import { pickDigestivePhoto, takeDigestivePhoto } from '@/features/digestive/photo';
import {
  enqueueAndUploadDigestivePhoto,
  markDigestiveUploadCompletedForEvent,
} from '@/features/digestive/upload';
import { removeFailedRetryPair } from '@/features/realtime/messageState';
import { rememberRealtimeSession, resumeRealtimeSession } from '@/features/realtime/sessionBridge';
import {
  MediaSourceSheet,
  type MediaSourceKind,
} from '@/features/realtime/MediaSourceSheet';
import { purchasesEnabled } from '@/mocks/entitlements';
import { ANALYSIS_POLL_TIMEOUT_MS } from '@/features/core/processingTimeout';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SpringPress } from '@/components/pressSpring';
import { WorldBackdrop } from '@/components/WorldBackdrop';
import { GuideOverlay } from '@/features/guide/GuideOverlay';
import { useGuide } from '@/features/guide/useGuide';
import { useGuideTargets } from '@/features/guide/useGuideTargets';

import { readHomeMessage, takeHomeMessage } from '@/features/realtime/homeMessage';
import {
  startNativeDictation,
  startWebDictation,
  type DictationHandle,
} from '@/features/realtime/voiceDictation';

type Message = { id: string; role: 'user' | 'assistant'; text: string; turn?: RealtimeTurn; failed?: boolean; retryForId?: string; retryText?: string; retryAttachmentUri?: string; retryPhotoId?: string; retryRequestId?: string; attachmentUri?: string };

/** Vector geometry keeps the send icon independent of icon-font loading. */
function SendArrow({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 20V4M5 11l7-7 7 7" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Unpin solo su cambio discorso esplicito — non su messaggi lunghi generici. */
function looksLikeTopicChange(text: string): boolean {
  const t = text.trim().toLocaleLowerCase('it-IT');
  if (t.length < 12) return false;
  if (
    /approfond|questo momento|questa analisi|la foto|il video|le feci|digest|cacca|abbaia|comportament|perch[eé]|cosa (hai visto|significa|vuol dire)/i.test(
      t,
    )
  ) {
    return false;
  }
  return /parliamo (di|di altro)|cambiando argomento|altra cosa|un['’ ]altra domanda|invece (parliamo|dimmi)|domanda diversa|lasciamo stare|basta (così|con questo)|passiamo a|del cibo che|della passeggiata|del veterinario|agenda|promemoria|intorno a (casa|noi)/i.test(
    t,
  );
}

export default function AskScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ eventId?: string | string[]; source?: string | string[]; sessionId?: string | string[]; entryId?: string | string[]; intent?: string | string[]; guide?: string | string[] }>();
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
  /** Episodio agganciato (diario / post-analisi): ogni turno resta su QUESTA lettura. */
  const [pinnedAnalysis, setPinnedAnalysis] = useState<{
    eventId: string;
    source: 'behavior' | 'digestive';
  } | null>(
    eventId && intent !== 'analyzing' && (source === 'behavior' || source === 'digestive')
      ? { eventId, source }
      : null,
  );
  const [focusedEventId, setFocusedEventId] = useState<string | undefined>(
    intent === 'analyzing' ? undefined : eventId,
  );
  const dictationRef = useRef<DictationHandle | null>(null);
  const analysisDoneRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  // State updates are asynchronous; this guard prevents two rapid taps from
  // starting the same upload/turn twice before `sending` is rendered.
  const mediaActionLock = useRef(false);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const [momentsBusy, setMomentsBusy] = useState<string | null>(null);
  const [savedToMoments, setSavedToMoments] = useState<Record<string, boolean>>({});
  const [mediaSheet, setMediaSheet] = useState<MediaSourceKind | null>(null);
  const latestAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const reducedMotion = useReducedMotion();
  const guideParam = Array.isArray(params.guide) ? params.guide[0] : params.guide;
  const guide = useGuide({ page: 'ask', dogId: dog.id, dogName: dog.name, force: guideParam === '1' });
  const { anchor, measureTarget } = useGuideTargets();
  const setConversationRef = useCallback((node: ScrollView | null) => {
    scrollRef.current = node;
    anchor('conversation')(node);
  }, [anchor]);
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
  const sessionCreateKey = useRef<{ scope: string; key: string } | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const start = useCallback(async () => {
    if (!dog.id) return;
    const key = `${dog.id}:${eventId ?? 'free'}:${sessionId ?? 'new'}:${intent ?? ''}:${source ?? ''}`;
    if (!sessionCreateKey.current || sessionCreateKey.current.scope !== key) {
      sessionCreateKey.current = {
        scope: key,
        key: `realtime-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      };
    }
    if (startedKey.current === key) return;
    startedKey.current = key;
    setStarting(true); setError(null);
    let resumedHandoff: { session: RealtimeSession; messages: Message[] } | null = null;
    try {
      const resumed = sessionId ? await resumeRealtimeSession<Message>(sessionId, dog.id) : null;
      resumedHandoff = resumed;
      if (sessionId && !resumed) throw new Error('Conversation unavailable');
      const next = resumed?.session ?? await createRealtimeSession(dog.id, sessionCreateKey.current.key);
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
        const analysisSource = digestiveHandoff ? 'digestive' : 'behavior';
        setPinnedAnalysis({ eventId, source: analysisSource });
        if (isRevisit) {
          const bridgeText = digestiveHandoff
            ? `Riprendiamo questa analisi di ${dog.name} dal diario.`
            : `Riprendiamo questo momento di ${dog.name} dal diario.`;
          const invite = digestiveHandoff
            ? `Vuoi approfondire questa analisi di ${dog.name}?`
            : `Vuoi approfondire questo momento di ${dog.name}?`;
          const turn = await createRealtimeTurn(next.id, bridgeText, invite, {
            eventId,
            source: analysisSource,
          });
          if (!mounted.current) return;
          const nextMessages: Message[] = [
            ...(resumed?.messages ?? []),
            {
              id: turn.id,
              role: 'assistant',
              text: turn.assistant_text,
              turn,
            },
          ];
          setMessages(nextMessages);
          await rememberRealtimeSession(next, nextMessages);
        } else {
          const text = digestiveHandoff
            ? 'Ho caricato la foto richiesta.'
            : 'Ho caricato il video richiesto.';
          const turn = await createRealtimeTurn(next.id, text, undefined, {
            eventId,
            source: analysisSource,
          });
          if (!mounted.current) return;
          setMessages([
            ...(resumed?.messages ?? []),
            { id: 'video-' + eventId, role: 'user', text },
            {
              id: turn.id,
              role: 'assistant',
              text: turn.assistant_text,
              turn,
            },
          ]);
        }
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
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            markDigestiveUploadCompletedForEvent(pendingAnalysis.eventId);
            if (
              isFailedDigestiveStatus(event.status) ||
              event.status === 'INSUFFICIENT_IMAGE' ||
              event.status === 'REJECTED_QUALITY'
            ) {
              if (cancelled || !mounted.current) return;
              setMediaPhase(null);
              setPendingAnalysis(null);
              setPinnedAnalysis(null);
              setMessages((current) => [
                ...current,
                {
                  id: 'analyze-fail-' + pendingAnalysis.eventId,
                  role: 'assistant',
                  text:
                    event.status === 'INSUFFICIENT_IMAGE' ||
                    event.status === 'REJECTED_QUALITY'
                      ? 'Questa foto non è abbastanza chiara. Puoi scattarne un’altra con più luce, da vicino e dall’alto?'
                      : 'Non sono riuscito a leggere questa foto. Puoi scattarne un’altra più chiara?',
                },
              ]);
              return;
            }
          } else {
            const event = await getBehaviorEvent(pendingAnalysis.eventId);
            if (!isTerminalBehaviorStatus(event.status)) {
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            markUploadCompletedForEvent(pendingAnalysis.eventId);
            if (
              event.status === 'FAILED_TERMINAL' ||
              event.status === 'CANCELLED' ||
              event.status === 'REJECTED_QUALITY'
            ) {
              if (cancelled || !mounted.current) return;
              setMediaPhase(null);
              setPendingAnalysis(null);
              setPinnedAnalysis(null);
              setMessages((current) => [
                ...current,
                {
                  id: 'analyze-fail-' + pendingAnalysis.eventId,
                  role: 'assistant',
                  text:
                    event.status === 'REJECTED_QUALITY'
                      ? 'Questo video non è abbastanza chiaro. Puoi rifarne uno breve, fermo e ben illuminato?'
                      : 'Non sono riuscito a leggere questo video. Puoi riprovare dalla chat?',
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
            const nextMessages: Message[] = [
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
            messagesRef.current = nextMessages;
            void rememberRealtimeSession(session, nextMessages);
            return nextMessages;
          });
          setPinnedAnalysis({
            eventId: pendingAnalysis.eventId,
            source: pendingAnalysis.source,
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
    if (!text || sending || mediaActionLock.current || !session) return;
    mediaActionLock.current = true;
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
          idempotencyKey: `chat-attachment-${requestId}`,
        });
        photoId = photo.id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-album', album.id] }),
        ]);
        setMediaPhase('analyzing');
      }
      const location = await readDeviceLocation();
      let activePin = pinnedAnalysis;
      if (activePin && looksLikeTopicChange(text)) {
        activePin = null;
        setPinnedAnalysis(null);
      }
      const activeEventId = focusedEventId ?? activePin?.eventId;
      const activeSource = focusedEventId
        ? behaviorSource
          ? 'behavior'
          : digestiveSource
            ? 'digestive'
            : activePin?.source
        : activePin?.source;
      const turn = await createRealtimeTurn(
        session.id,
        text,
        undefined,
        {
          idempotencyKey: requestId,
          eventId: activeEventId,
          source: activeSource,
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
    } finally {
      mediaActionLock.current = false;
      if (mounted.current) { setSending(false); setMediaPhase(null); }
    }
  }, [
    behaviorSource,
    digestiveSource,
    dog.id,
    focusedEventId,
    pinnedAnalysis,
    sending,
    session,
    queryClient,
  ]);

  // Claim only once after a session is ready; failures use the normal retry UI.
  useEffect(() => {
    if (starting || sending || !session || session.dog_id !== dog.id) return;
    const text = takeHomeMessage(entryId, userId, dog.id);
    if (text) void send(text);
  }, [dog.id, entryId, send, sending, session, starting, userId]);

  const captureDigestiveFromChat = useCallback(async (source: 'camera' | 'library' = 'camera') => {
    if (sending || analyzing || !session || !userId || !dog.id) return;
    setError(null);
    setMediaPhase('uploading');
    try {
      const uri =
        source === 'library' ? await pickDigestivePhoto() : await takeDigestivePhoto();
      if (!uri) {
        setMediaPhase(null);
        return;
      }
      const uploadMsg: Message = {
        id: 'digest-up-' + Date.now(),
        role: 'user',
        text: 'Ho caricato la foto richiesta.',
        attachmentUri: uri,
      };
      const withUpload = [...messagesRef.current, uploadMsg];
      setMessages(withUpload);
      messagesRef.current = withUpload;
      if (usingMockGate) {
        setMediaPhase('analyzing');
        await new Promise((r) => setTimeout(r, 1200));
        setMediaPhase(null);
        const mockMessages: Message[] = [
          ...withUpload,
          {
            id: 'digest-mock-' + Date.now(),
            role: 'assistant',
            text: `Ho guardato la foto. Dimmi pure cosa vuoi approfondire sulla digestione di ${dog.name}.`,
          },
        ];
        setMessages(mockMessages);
        messagesRef.current = mockMessages;
        await rememberRealtimeSession(session, mockMessages);
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
      await rememberRealtimeSession(session, withUpload);
    } catch (err) {
      setMediaPhase(null);
      if (isQuotaExhaustedError(err)) {
        if (purchasesEnabled) {
          router.replace('/paywall');
          return;
        }
        setError(
          'Hai esaurito le analisi del mese. Gli acquisti arriveranno a breve — non è un problema di connessione.',
        );
        return;
      }
      setError('Non sono riuscito a scattare o caricare la foto. Riprova.');
    }
  }, [
    analyzing,
    dog.id,
    dog.name,
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
      await captureDigestiveFromChat('camera');
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
      await captureDigestiveFromChat('library');
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
      if (!session || !userId || !dog.id || mediaActionLock.current) return;
      mediaActionLock.current = true;
      setError(null);
      setMediaPhase('uploading');
      const uploadMsg: Message = {
        id: 'video-up-' + Date.now(),
        role: 'user',
        text: 'Ho caricato il video richiesto.',
      };
      const withUpload = [...messagesRef.current, uploadMsg];
      setMessages(withUpload);
      messagesRef.current = withUpload;
      try {
        if (usingMockGate) {
          setMediaPhase('analyzing');
          await new Promise((r) => setTimeout(r, 1200));
          setMediaPhase(null);
          const mockMessages: Message[] = [
            ...withUpload,
            {
              id: 'video-mock-' + Date.now(),
              role: 'assistant',
              text: `Ho guardato il video di ${dog.name}. Dimmi pure cosa vuoi approfondire.`,
            },
          ];
          setMessages(mockMessages);
          messagesRef.current = mockMessages;
          await rememberRealtimeSession(session, mockMessages);
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
        await rememberRealtimeSession(session, withUpload);
      } catch (err) {
        setMediaPhase(null);
        if (isQuotaExhaustedError(err)) {
          if (purchasesEnabled) {
            router.replace('/paywall');
            return;
          }
          setError(
            'Hai esaurito le analisi del mese. Gli acquisti arriveranno a breve — non è un problema di connessione.',
          );
          return;
        }
        setError('Non sono riuscito a caricare il video. Riprova.');
      } finally {
        mediaActionLock.current = false;
      }
    },
    [dog.id, dog.name, router, session, userId, usingMockGate],
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
    await rememberRealtimeSession(session, messagesRef.current);
    // Dopo lo scatto, uploading torna in Ask con intent=analyzing (niente processing).
    router.push({
      pathname: '/behavior/capture',
      params: { from: 'ask', sessionId: session.id },
    } as never);
  }, [analyzing, router, sending, session]);

  const openMediaSheet = useCallback(
    (kind: MediaSourceKind) => {
      if (sending || analyzing || !session) return;
      setMediaSheet(kind);
    },
    [analyzing, sending, session],
  );

  const onMediaSheetCapture = useCallback(() => {
    const kind = mediaSheet;
    setMediaSheet(null);
    if (kind === 'photo') void sharePhoto();
    else if (kind === 'video') void openVideoCapture();
  }, [mediaSheet, openVideoCapture, sharePhoto]);

  const onMediaSheetLibrary = useCallback(() => {
    const kind = mediaSheet;
    setMediaSheet(null);
    if (kind === 'photo') void pickPhoto();
    else if (kind === 'video') void pickVideo();
  }, [mediaSheet, pickPhoto, pickVideo]);

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
      await uploadAlbumPhoto(album.id, uri, {
        caption: `Ricordo di ${dog.name}`,
        visibility: 'PRIVATE',
        idempotencyKey: `moments-${messageId}`,
      });
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

  const starterPrompts = [
    { label: `Com'è Oreo oggi?`, icon: 'sparkles-outline' as const },
    { label: 'Ti mostro una foto', icon: 'images-outline' as const },
    { label: 'Parliamo di cibo', icon: 'nutrition-outline' as const },
  ];
  const hasUserMessage = messages.some((message) => message.role === 'user');

  return <LinearGradient colors={['#EFF8FF', '#F8FBFF', '#FFFFFF']} style={styles.root}>
    <WorldBackdrop world="ask" />
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <SpringPress accessibilityRole="button" accessibilityLabel="Torna alla Home" onPress={() => router.replace('/(tabs)/home' as never)} style={styles.headerButton} pressableStyle={styles.headerButtonPressable}><Ionicons name="chevron-back" size={24} color={colors.text} /></SpringPress>
        <View style={styles.headerIdentity}>
          <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={40} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PARLA CON DOGLY</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>Su {dog.name}</Text>
          </View>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={setConversationRef} style={styles.scroll} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
          {starting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Preparo la conversazione…</Text></View> : null}
          {error && !sending ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void start()}><Text style={styles.retry}>Riprova</Text></Pressable></View> : null}
          {messages.map((message, messageIndex) => <Animated.View key={message.id} entering={reducedMotion ? undefined : FadeInDown.duration(260).delay(Math.min(messageIndex, 8) * 28)} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
            <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              {message.role === 'assistant' ? <Text style={styles.messageSender}>DOGLY</Text> : null}
              <Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.text}</Text>
              {message.attachmentUri ? <Image source={{ uri: message.attachmentUri }} style={styles.messageAttachment} accessibilityLabel="Foto condivisa nella conversazione" /> : null}
              {message.failed ? <Pressable accessibilityRole="button" onPress={() => { setMessages((current) => removeFailedRetryPair(current, message.id)); void send(message.retryText ?? '', message.retryAttachmentUri ? { uri: message.retryAttachmentUri, purpose: message.retryText ?? 'Foto condivisa nella conversazione' } : undefined, message.retryPhotoId, message.retryRequestId); }} style={styles.retryInside}><Ionicons name="refresh" size={15} color={colors.primary} /><Text style={styles.retry}>Riprova</Text></Pressable> : null}
              {message.turn?.terminal_state === 'SAFETY_INTERRUPT' ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/help', params: { returnTo: 'ask' } } as never)} style={styles.helpLink}><Text style={styles.helpLinkText}>Apri l’assistenza</Text><Ionicons name="arrow-forward" size={15} color={colors.primary} /></Pressable> : null}
              {!sending && message.id === latestAssistantId && message.turn?.question_options?.length ? <View style={styles.questionOptions}>{message.turn.question_options.map((option) => <SpringPress key={option} accessibilityRole="button" onPress={() => void send(option)} disabled={sending} style={styles.questionOption} pressableStyle={({ pressed }) => [styles.questionOptionPressable, pressed && styles.pressed]}><Text style={styles.questionOptionText}>{option}</Text><Ionicons name="arrow-up" size={14} color={colors.primary} /></SpringPress>)}</View> : null}
              {!sending && message.id === latestAssistantId && neededMedia === 'PHOTO' ? (
                <SpringPress
                  accessibilityRole="button"
                  accessibilityLabel={
                    message.turn?.media_prompt ||
                    (needsDigestivePhoto
                      ? `Mostra una foto per la digestione di ${dog.name}`
                      : `Mostrami ${dog.name} in una foto`)
                  }
                  onPress={() => openMediaSheet('photo')}
                  style={[styles.mediaCta, styles.mediaCtaPulse]}
                  pressableStyle={({ pressed }) => [styles.mediaCtaPressable, pressed && styles.pressed]}
                >
                  <View style={styles.mediaIcon}>
                    <Ionicons name="camera" size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.mediaTitle}>
                    {needsDigestivePhoto ? 'Aggiungi la foto' : 'Aggiungi una foto'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </SpringPress>
              ) : null}
              {!sending && message.id === latestAssistantId && neededMedia === 'VIDEO' ? (
                <SpringPress
                  accessibilityRole="button"
                  accessibilityLabel={
                    message.turn?.media_prompt || 'Mostrami questo momento in un video'
                  }
                  onPress={() => openMediaSheet('video')}
                  style={[styles.mediaCta, styles.mediaCtaPulse]}
                  pressableStyle={({ pressed }) => [styles.mediaCtaPressable, pressed && styles.pressed]}
                >
                  <View style={styles.mediaIcon}>
                    <Ionicons name="videocam" size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.mediaTitle}>Aggiungi un video</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </SpringPress>
              ) : null}
              {!sending && message.id === latestAssistantId && message.turn?.food_review_href ? <SpringPress accessibilityRole="button" accessibilityLabel="Apri alimentazione" onPress={() => router.push('/nutrition/foods' as never)} style={styles.mediaCta} pressableStyle={({ pressed }) => [styles.mediaCtaPressable, pressed && styles.pressed]}><View style={styles.mediaIcon}><Ionicons name="nutrition-outline" size={17} color={colors.primary} /></View><Text style={styles.mediaTitle}>Rivedi l’alimento</Text><Ionicons name="chevron-forward" size={16} color={colors.primary} /></SpringPress> : null}
              {!sending && message.id === latestAssistantId && message.turn?.save_to_moments_suggested ? (() => {
                const uri = priorUserAttachmentUri(messageIndex);
                if (!uri) return null;
                const saved = Boolean(savedToMoments[message.id]);
                return (
                  <SpringPress
                    accessibilityRole="button"
                    accessibilityLabel={saved ? 'Salvata nei Momenti' : 'Salva nei Momenti'}
                    disabled={saved || momentsBusy === message.id}
                    onPress={() => void saveAttachmentToMoments(message.id, uri)}
                    style={styles.saveMomentChip}
                    pressableStyle={({ pressed }) => [styles.saveMomentPressable, pressed && styles.pressed]}
                  >
                    {momentsBusy === message.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={saved ? 'bookmark' : 'bookmark-outline'}
                        size={16}
                        color={saved ? colors.primary : colors.textSecondary}
                      />
                    )}
                    <Text style={[styles.saveMomentText, saved && styles.saveMomentTextDone]}>
                      {saved ? 'Nei Momenti' : 'Salva'}
                    </Text>
                  </SpringPress>
                );
              })() : null}
              {message.turn?.memory_proposal ? <View style={styles.memory}><Text style={styles.memoryLabel}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Tengo presente questa abitudine?' : 'Posso ricordare questa cosa?'}</Text><Text style={styles.memoryText}>{message.turn.memory_proposal.statement}</Text><View style={styles.memoryActions}><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'CONFIRM')} style={styles.memoryButton}><Text style={styles.memoryConfirm}>{message.turn.memory_proposal.category === 'ROUTINE' ? 'Sì, tienila presente' : 'Sì, ricordala'}</Text></Pressable><Pressable disabled={memoryBusy === message.turn.memory_proposal.id} onPress={() => void decideMemory(message.turn!.memory_proposal!, 'REJECT')}><Text style={styles.memoryReject}>Non ora</Text></Pressable></View></View> : null}
            </View>
          </Animated.View>)}
          {!starting && !sending && !hasUserMessage && messages.length === 1 ? (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(320).delay(100)} style={styles.starterPanel}>
              <View style={styles.starterHeading}>
                <View style={styles.starterIcon}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                </View>
                <View style={styles.starterCopy}>
                  <Text style={styles.starterTitle}>Da dove partiamo?</Text>
                  <Text style={styles.starterSubtitle}>Scegli un punto o scrivimi liberamente.</Text>
                </View>
              </View>
              <View style={styles.starterOptions}>
                {starterPrompts.map((prompt) => (
                  <SpringPress
                    key={prompt.label}
                    accessibilityRole="button"
                    accessibilityLabel={prompt.label}
                    onPress={() => {
                      if (prompt.label === 'Ti mostro una foto') {
                        openMediaSheet('photo');
                      } else {
                        void send(prompt.label);
                      }
                    }}
                    pressableStyle={({ pressed }) => [styles.starterOption, pressed && styles.pressed]}
                    scaleTo={0.97}
                  >
                    <Ionicons name={prompt.icon} size={16} color={colors.primary} />
                    <Text style={styles.starterOptionText}>{prompt.label}</Text>
                    <Ionicons name="arrow-up" size={14} color={colors.primary} />
                  </SpringPress>
                ))}
              </View>
            </Animated.View>
          ) : null}
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
          <View ref={anchor('composer')} style={[styles.composerShell, dictating && styles.composerShellListening]}>
            {dictating ? (
              <View style={styles.dictationBanner} accessibilityLiveRegion="polite">
                <View style={styles.dictationPulse} />
                <Text style={styles.dictationBannerText}>Ti ascolto… tocca Detta per fermare</Text>
              </View>
            ) : null}
            <TextInput
              accessibilityLabel={'Scrivi a DOGly di ' + dog.name}
              placeholder={dictating ? 'Sto ascoltando…' : 'Raccontami di ' + dog.name + '…'}
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
              <View ref={anchor('media')} style={styles.composerActions}>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Aggiungi una foto"
                onPress={() => openMediaSheet('photo')}
                disabled={sending || analyzing || !session}
                style={[styles.mediaButton, neededMedia === 'PHOTO' && styles.mediaButtonLit]}
                pressableStyle={({ pressed }) => [styles.mediaButtonPressable, neededMedia === 'PHOTO' && styles.mediaButtonLit, pressed && styles.pressed]}
              >
                <Ionicons
                  name={neededMedia === 'PHOTO' ? 'camera' : 'images-outline'}
                  size={20}
                  color={neededMedia === 'PHOTO' ? '#FFFFFF' : colors.primary}
                />
                <Text style={[styles.mediaButtonText, neededMedia === 'PHOTO' && styles.mediaButtonTextLit]}>Foto</Text>
              </SpringPress>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Aggiungi un video"
                onPress={() => openMediaSheet('video')}
                disabled={sending || analyzing || !session}
                style={[styles.mediaButton, neededMedia === 'VIDEO' && styles.mediaButtonLit]}
                pressableStyle={({ pressed }) => [styles.mediaButtonPressable, neededMedia === 'VIDEO' && styles.mediaButtonLit, pressed && styles.pressed]}
              >
                <Ionicons
                  name={neededMedia === 'VIDEO' ? 'videocam' : 'videocam-outline'}
                  size={20}
                  color={neededMedia === 'VIDEO' ? '#FFFFFF' : colors.primary}
                />
                <Text style={[styles.mediaButtonText, neededMedia === 'VIDEO' && styles.mediaButtonTextLit]}>Video</Text>
              </SpringPress>
              <SpringPress accessibilityRole="button" accessibilityLabel={dictating ? 'Ferma dettatura' : 'Detta un messaggio'} onPress={toggleDictation} disabled={sending || !session} style={[styles.mic, dictating && styles.micActive]} pressableStyle={({ pressed }) => [styles.micPressable, dictating && styles.micActive, pressed && styles.pressed]}>
                <Ionicons name={dictating ? 'mic' : 'mic-outline'} size={19} color={dictating ? '#FFFFFF' : colors.primary} />
                <Text style={[styles.mediaButtonText, dictating && styles.mediaButtonTextLit]}>Detta</Text>
              </SpringPress>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Parla con DOGly"
                onPress={() => router.push('/ask/live' as never)}
                disabled={!session}
                style={styles.voiceButton}
                pressableStyle={({ pressed }) => [styles.voiceButtonPressable, pressed && styles.pressed]}
              >
                <Ionicons name="pulse" size={16} color={colors.primary} />
                <Text style={styles.voiceButtonText}>Parla</Text>
              </SpringPress>
              </View>
              <SpringPress accessibilityRole="button" accessibilityLabel="Invia messaggio" onPress={() => void send(draft)} disabled={!draft.trim() || sending || !session} style={[styles.send, (!draft.trim() || sending || !session) && styles.sendDisabled]} pressableStyle={({ pressed }) => [styles.sendPressable, (!draft.trim() || sending || !session) && styles.sendDisabled, pressed && styles.pressed]}>
                <SendArrow />
              </SpringPress>
            </View>
          </View>
        </View>
        <Text style={styles.disclaimer}>DOGly aiuta a leggere i comportamenti. Per sintomi o urgenze, contatta un veterinario.</Text>
      </KeyboardAvoidingView>
      <MediaSourceSheet
        visible={mediaSheet !== null}
        kind={mediaSheet ?? 'photo'}
        dogName={dog.name}
        onClose={() => setMediaSheet(null)}
        onCapture={onMediaSheetCapture}
        onLibrary={onMediaSheetLibrary}
      />
      <GuideOverlay
        visible={guide.visible}
        page="ask"
        dogName={dog.name}
        locale={guide.locale}
        onLocaleChange={guide.setLocale}
        onClose={guide.close}
        measureTarget={measureTarget}
      />
    </SafeAreaView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  safe: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerButtonPressable: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE8F4' },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  headerCopy: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 0.8 },
  headerTitle: { color: colors.text, fontSize: typography.size.md, lineHeight: 19, fontWeight: typography.weight.bold, letterSpacing: -0.1 },
  voiceButton: {
    width: 48,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.18)',
  },
  voiceButtonPressable: {
    borderRadius: 999,
  },
  voiceButtonText: {
    color: colors.primary,
    fontWeight: typography.weight.bold,
    fontSize: 10,
  },
  body: { flex: 1 },
  scroll: { flex: 1 }, conversation: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }, intro: { backgroundColor: 'rgba(255,255,255,0.84)', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(0,80,216,0.1)' }, sparkle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E6F1FF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, introTitle: { color: colors.text, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: spacing.xs }, introText: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: 22 }, loading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm }, muted: { color: colors.textMuted, fontSize: typography.size.sm }, error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FFF2F0' }, errorText: { color: colors.danger, flex: 1, fontSize: typography.size.sm }, retry: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, messageRow: { width: '100%', alignItems: 'flex-start' }, userRow: { alignItems: 'flex-end' }, bubble: { maxWidth: '92%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 13 }, assistantBubble: { backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: '#DCE8F4', borderLeftWidth: 3, borderLeftColor: colors.accent, borderBottomLeftRadius: 7, shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1 }, userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 }, messageSender: { color: colors.accentPressed, fontSize: 10, lineHeight: 13, fontWeight: typography.weight.bold, letterSpacing: 1, marginBottom: 4 }, messageText: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: typography.weight.medium, letterSpacing: 0.05 }, userText: { color: '#FFFFFF', fontWeight: typography.weight.semibold },  retryInside: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }, helpLink: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, helpLinkText: { color: colors.primary, fontWeight: typography.weight.bold }, memory: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: '#E4EDF6', paddingTop: spacing.md }, memoryLabel: { color: colors.text, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryText: { color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.size.sm, lineHeight: 19 }, memoryActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.md }, memoryButton: { backgroundColor: '#E6F1FF', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, memoryConfirm: { color: colors.primary, fontWeight: typography.weight.bold, fontSize: typography.size.sm }, memoryReject: { color: colors.textMuted, fontWeight: typography.weight.semibold, fontSize: typography.size.sm }, thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  starterPanel: { marginTop: spacing.xs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#DCE8F4', shadowColor: colors.text, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  starterHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  starterIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  starterCopy: { flex: 1, gap: 2 },
  starterTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: typography.weight.bold, letterSpacing: -0.1 },
  starterSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  starterOptions: { gap: spacing.xs },
  starterOption: { minHeight: 38, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#DCE8F4', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  starterOptionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: typography.weight.semibold },
  composerWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  composerShell: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D7E6F4',
    padding: spacing.sm,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  composerShellListening: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
  },
  dictationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  dictationPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  dictationBannerText: {
    color: colors.accentPressed,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  input: {
    width: '100%',
    minHeight: 58,
    maxHeight: 140,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: typography.size.md,
    lineHeight: 22,
  },
  composerTools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F8',
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mic: { minWidth: 54, height: 40, paddingHorizontal: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#E6F1FF' },
  micPressable: { width: '100%', height: '100%', borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  micActive: { backgroundColor: colors.primary },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendPressable: { width: '100%', height: '100%', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#B7C7DB' },
  pressed: { opacity: 0.82 },
  disclaimer: { width: '100%', maxWidth: 560, alignSelf: 'center', color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  mediaButton: {
    minWidth: 54,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#E6F1FF',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mediaButtonPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  mediaButtonLit: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mediaButtonText: { color: colors.primary, fontSize: 12, lineHeight: 15, fontWeight: typography.weight.bold, letterSpacing: 0.1 },
  mediaButtonTextLit: { color: '#FFFFFF' },
  questionOptions: { marginTop: spacing.md, gap: spacing.xs }, questionOption: { minHeight: 38, borderRadius: radius.md }, questionOptionPressable: { minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#D7E6F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, questionOptionText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.sm },
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
  mediaCtaPressable: {
    minHeight: 48,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
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
  saveMomentChip: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F4F8FC',
    borderWidth: 1,
    borderColor: '#D7E6F4',
  },
  saveMomentPressable: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveMomentText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  saveMomentTextDone: { color: colors.primary },
});

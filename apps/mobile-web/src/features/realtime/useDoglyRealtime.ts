import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createRealtimeSession,
  createRealtimeTurn,
  decideRealtimeMemory,
  endRealtimeSession,
  getRealtimeClientSecret,
  type RealtimeSession,
  type RealtimeTurn,
} from './api';

export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

type RealtimeServerEvent = {
  type: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  video: false,
};

export function useDoglyRealtime(dogId: string) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [lastTurn, setLastTurn] = useState<RealtimeTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingTrackRef = useRef<MediaStreamTrack | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sessionDataRef = useRef<RealtimeSession | null>(null);
  const sessionPromiseRef = useRef<Promise<RealtimeSession> | null>(null);
  const userTranscriptRef = useRef('');
  const assistantRef = useRef('');
  const persistLockRef = useRef(false);
  const greetingRef = useRef(false);
  const responseOpenRef = useRef(false);
  const mutedByUserRef = useRef(false);

  const closeMedia = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.remove();
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    outgoingTrackRef.current = null;
    persistLockRef.current = false;
    greetingRef.current = false;
    responseOpenRef.current = false;
  }, []);

  const setMicEnabled = useCallback((enabled: boolean) => {
    const track = outgoingTrackRef.current;
    if (!track) return;
    track.enabled = enabled && !mutedByUserRef.current;
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current && sessionDataRef.current) return sessionDataRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    const promise = createRealtimeSession(dogId, 'VOICE');
    sessionPromiseRef.current = promise;
    try {
      const created = await promise;
      sessionRef.current = created.id;
      sessionDataRef.current = created;
      setSessionId(created.id);
      setSession(created);
      return created;
    } finally {
      sessionPromiseRef.current = null;
    }
  }, [dogId]);

  const persistSpokenTurn = useCallback(async () => {
    const activeSession = sessionRef.current;
    const userText = userTranscriptRef.current.trim();
    const assistantText = assistantRef.current.trim();
    if (!activeSession || !userText || !assistantText || persistLockRef.current) {
      return;
    }
    persistLockRef.current = true;
    try {
      const turn = await createRealtimeTurn(activeSession, userText, assistantText);
      setLastTurn(turn);
    } catch {
      // Voice already answered; audit persistence must never block the conversation.
    } finally {
      persistLockRef.current = false;
    }
  }, []);

  const cancelOpenResponse = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return;
    if (responseOpenRef.current) {
      channel.send(JSON.stringify({ type: 'response.cancel' }));
      responseOpenRef.current = false;
    }
  }, []);

  const sendVoiceText = useCallback(
    (text: string) => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open' || greetingRef.current) {
        return false;
      }
      userTranscriptRef.current = text;
      assistantRef.current = '';
      setTranscript(text);
      setAssistantDraft('');
      cancelOpenResponse();
      channel.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text }],
          },
        }),
      );
      channel.send(
        JSON.stringify({
          type: 'response.create',
          response: { output_modalities: ['audio'] },
        }),
      );
      responseOpenRef.current = true;
      setVoiceState('speaking');
      return true;
    },
    [cancelOpenResponse],
  );

  const handleServerEvent = useCallback(
    (event: RealtimeServerEvent) => {
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          if (greetingRef.current) return;
          userTranscriptRef.current = '';
          setTranscript('');
          setVoiceState('listening');
          break;
        case 'conversation.item.input_audio_transcription.delta':
          if (event.delta) {
            userTranscriptRef.current += event.delta;
            setTranscript(userTranscriptRef.current);
          }
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript) {
            userTranscriptRef.current = event.transcript;
            setTranscript(event.transcript);
          }
          break;
        case 'response.created':
          responseOpenRef.current = true;
          break;
        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta':
          if (event.delta) {
            assistantRef.current += event.delta;
            setAssistantDraft(assistantRef.current);
          }
          setVoiceState('speaking');
          break;
        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done':
          if (event.transcript) {
            assistantRef.current = event.transcript;
            setAssistantDraft(event.transcript);
          }
          break;
        case 'response.done':
        case 'response.cancelled':
          responseOpenRef.current = false;
          if (greetingRef.current) {
            greetingRef.current = false;
            setMicEnabled(true);
            setVoiceState('listening');
            return;
          }
          setVoiceState('listening');
          void persistSpokenTurn();
          break;
        case 'error':
          setError(event.error?.message ?? 'La voce DOGly si è interrotta.');
          setVoiceState('error');
          break;
      }
    },
    [persistSpokenTurn, setMicEnabled],
  );

  const connect = useCallback(async () => {
    if (Platform.OS !== 'web' || !dogId || voiceState === 'connecting') return;
    setError(null);
    setVoiceState('connecting');
    try {
      const prepared = await ensureSession();
      const secret = await getRealtimeClientSecret(prepared.id);

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      audioRef.current = audio;
      peer.ontrack = (event) => {
        if (event.track.kind !== 'audio') return;
        const remote = new MediaStream([event.track]);
        const previous = audio.srcObject;
        audio.srcObject = remote;
        if (previous instanceof MediaStream) {
          previous.getTracks().forEach((track) => {
            if (track !== event.track) track.stop();
          });
        }
        void audio.play().catch(() => undefined);
      };

      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      streamRef.current = stream;
      const outgoing = stream.getAudioTracks()[0];
      outgoingTrackRef.current = outgoing;
      outgoing.enabled = false;
      mutedByUserRef.current = false;
      setMuted(false);
      peer.addTrack(outgoing, stream);

      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.addEventListener('message', (message) => {
        handleServerEvent(JSON.parse(message.data) as RealtimeServerEvent);
      });
      channel.addEventListener('open', () => {
        greetingRef.current = true;
        setVoiceState('speaking');
        channel.send(
          JSON.stringify({
            type: 'response.create',
            response: {
              output_modalities: ['audio'],
              instructions: `Pronuncia esattamente questa frase, una sola volta, come se stessi parlando con un amico, e poi taci: ${JSON.stringify(
                prepared.welcome_text,
              )}`,
            },
          }),
        );
        responseOpenRef.current = true;
      });
      channel.addEventListener('close', () => setVoiceState('idle'));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdp = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.value}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdp.ok) throw new Error('Connessione voce rifiutata');
      await peer.setRemoteDescription({
        type: 'answer',
        sdp: await sdp.text(),
      });
    } catch {
      closeMedia();
      if (sessionRef.current) {
        void endRealtimeSession(sessionRef.current).catch(() => undefined);
      }
      sessionRef.current = null;
      sessionDataRef.current = null;
      setSessionId(null);
      setError(
        'Non riesco ad aprire il microfono. Puoi continuare scrivendo a DOGly.',
      );
      setVoiceState('error');
    }
  }, [closeMedia, dogId, ensureSession, handleServerEvent, voiceState]);

  const disconnect = useCallback(async () => {
    closeMedia();
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    sessionDataRef.current = null;
    setSessionId(null);
    setSession(null);
    setVoiceState('idle');
    if (activeSession) await endRealtimeSession(activeSession).catch(() => undefined);
  }, [closeMedia]);

  const sendText = useCallback(
    async (text: string) => {
      if (!dogId || !text.trim()) return;
      const spoken = text.trim();
      setError(null);
      if (sendVoiceText(spoken)) return;
      setVoiceState('thinking');
      try {
        const prepared = await ensureSession();
        setTranscript(spoken);
        const turn = await createRealtimeTurn(prepared.id, spoken);
        setLastTurn(turn);
        setAssistantDraft(turn.assistant_text);
        setVoiceState('idle');
      } catch {
        setError('DOGly non riesce a rispondere in questo momento.');
        setVoiceState('error');
      }
    },
    [dogId, ensureSession, sendVoiceText],
  );

  const toggleMute = useCallback(() => {
    mutedByUserRef.current = !mutedByUserRef.current;
    setMicEnabled(!mutedByUserRef.current);
    setMuted(mutedByUserRef.current);
  }, [setMicEnabled]);

  const decideMemory = useCallback(
    async (action: 'CONFIRM' | 'REJECT') => {
      const proposal = lastTurn?.memory_proposal;
      if (!proposal) return;
      await decideRealtimeMemory(proposal.id, action);
      setLastTurn((current) =>
        current ? { ...current, memory_proposal: null } : current,
      );
    },
    [lastTurn],
  );

  useEffect(() => {
    if (dogId) void ensureSession();
    return () => closeMedia();
  }, [closeMedia, dogId, ensureSession]);

  return {
    voiceSupported: Platform.OS === 'web' && typeof RTCPeerConnection !== 'undefined',
    voiceState,
    session,
    sessionId,
    transcript,
    assistantDraft,
    lastTurn,
    error,
    muted,
    connect,
    disconnect,
    sendText,
    toggleMute,
    decideMemory,
  };
}

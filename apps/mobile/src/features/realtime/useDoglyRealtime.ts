import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';
import {
  createRealtimeSession,
  createRealtimeTurn,
  decideRealtimeMemory,
  endRealtimeSession,
  getRealtimeClientSecret,
  type RealtimeSession,
  type RealtimeTurn,
} from './api';

type NativeMediaConstraints = Parameters<typeof mediaDevices.getUserMedia>[0];

export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

type ServerEvent = {
  type: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

export function useDoglyRealtime(dogId: string) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [transcript, setTranscript] = useState('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [lastTurn, setLastTurn] = useState<RealtimeTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<RTCPeerConnection['createDataChannel']> | null>(
    null,
  );
  const streamRef = useRef<MediaStream | null>(null);
  const outgoingTrackRef = useRef<{ enabled: boolean } | null>(null);
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
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
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
      setSession(created);
      return created;
    } finally {
      sessionPromiseRef.current = null;
    }
  }, [dogId]);

  const persistSpokenTurn = useCallback(async () => {
    const sessionId = sessionRef.current;
    const userText = userTranscriptRef.current.trim();
    const assistantText = assistantRef.current.trim();
    if (!sessionId || !userText || !assistantText || persistLockRef.current) return;
    persistLockRef.current = true;
    try {
      const turn = await createRealtimeTurn(sessionId, userText, assistantText);
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

  const handleEvent = useCallback(
    (event: ServerEvent) => {
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
      }
    },
    [persistSpokenTurn, setMicEnabled],
  );

  const connect = useCallback(async () => {
    if (!dogId || voiceState === 'connecting') return;
    setError(null);
    setVoiceState('connecting');
    try {
      const prepared = await ensureSession();
      const secret = await getRealtimeClientSecret(prepared.id);
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const stream = (await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          // react-native-webrtc accepts standard audio constraints at runtime,
          // but its current declaration only lists video-track fields.
        } as unknown as NativeMediaConstraints['audio'],
        video: false,
      })) as MediaStream;
      streamRef.current = stream;
      const outgoing = stream.getAudioTracks()[0];
      outgoingTrackRef.current = outgoing;
      outgoing.enabled = false;
      mutedByUserRef.current = false;
      setMuted(false);
      peer.addTrack(outgoing, stream);
      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.onmessage = (message: { data: unknown }) =>
        handleEvent(JSON.parse(String(message.data)) as ServerEvent);
      channel.onopen = () => {
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
      };
      channel.onclose = () => setVoiceState('idle');
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.value}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!response.ok) throw new Error('Realtime connection refused');
      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: await response.text(),
        }),
      );
    } catch {
      closeMedia();
      if (sessionRef.current) {
        void endRealtimeSession(sessionRef.current).catch(() => undefined);
      }
      sessionRef.current = null;
      sessionDataRef.current = null;
      setError(
        'Non riesco ad aprire il microfono. Puoi continuare scrivendo a DOGly.',
      );
      setVoiceState('error');
    }
  }, [closeMedia, dogId, ensureSession, handleEvent, voiceState]);

  const disconnect = useCallback(async () => {
    closeMedia();
    const sessionId = sessionRef.current;
    sessionRef.current = null;
    sessionDataRef.current = null;
    setSession(null);
    setVoiceState('idle');
    if (sessionId) await endRealtimeSession(sessionId).catch(() => undefined);
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
    voiceSupported: true,
    voiceState,
    session,
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

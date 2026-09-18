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
  const sessionRef = useRef<string | null>(null);
  const sessionDataRef = useRef<RealtimeSession | null>(null);
  const sessionPromiseRef = useRef<Promise<RealtimeSession> | null>(null);
  const handledCalls = useRef(new Set<string>());

  const closeMedia = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    handledCalls.current.clear();
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

  const handleToolCall = useCallback(async (event: ServerEvent) => {
    const channel = channelRef.current;
    const sessionId = sessionRef.current;
    const callId = event.call_id;
    if (!channel || !sessionId || !callId || handledCalls.current.has(callId)) return;
    handledCalls.current.add(callId);
    setVoiceState('thinking');
    try {
      const args = JSON.parse(event.arguments ?? '{}') as { user_text?: string };
      const userText = args.user_text?.trim();
      if (!userText) throw new Error('Missing transcript');
      setTranscript(userText);
      const turn = await createRealtimeTurn(sessionId, userText);
      setLastTurn(turn);
      setAssistantDraft('');
      channel.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({
              assistant_text: turn.assistant_text,
              question: turn.question,
            }),
          },
        }),
      );
      channel.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            tool_choice: 'none',
            instructions:
              'Pronuncia fedelmente assistant_text e poi question, se presente. Non aggiungere altro.',
          },
        }),
      );
      setVoiceState('speaking');
    } catch {
      setError('DOGly non è riuscito a completare questa risposta.');
      setVoiceState('error');
    }
  }, []);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          setTranscript('');
          setAssistantDraft('');
          setVoiceState('listening');
          break;
        case 'input_audio_buffer.speech_stopped':
          setVoiceState('thinking');
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript) setTranscript(event.transcript);
          break;
        case 'response.function_call_arguments.done':
          if (event.name === 'dogly_turn') void handleToolCall(event);
          break;
        case 'response.output_audio_transcript.delta':
          setAssistantDraft((current) => current + (event.delta ?? ''));
          setVoiceState('speaking');
          break;
        case 'response.done':
          setVoiceState('listening');
          break;
        case 'error':
          setError(event.error?.message ?? 'La voce DOGly si è interrotta.');
          setVoiceState('error');
      }
    },
    [handleToolCall],
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
        audio: true,
        video: false,
      })) as MediaStream;
      streamRef.current = stream;
      peer.addTrack(stream.getAudioTracks()[0], stream);
      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.onmessage = (message: { data: unknown }) =>
        handleEvent(JSON.parse(String(message.data)) as ServerEvent);
      channel.onopen = () => {
        setVoiceState('speaking');
        channel.send(
          JSON.stringify({
            type: 'response.create',
            response: {
              output_modalities: ['audio'],
              tool_choice: 'none',
              instructions: `Pronuncia esattamente questa frase e nulla di più: ${JSON.stringify(
                prepared.welcome_text,
              )}`,
            },
          }),
        );
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
      setVoiceState('thinking');
      setError(null);
      try {
        const prepared = await ensureSession();
        const sessionId = prepared.id;
        setTranscript(text.trim());
        const turn = await createRealtimeTurn(sessionId, text.trim());
        setLastTurn(turn);
        setAssistantDraft(turn.assistant_text);
        setVoiceState('idle');
      } catch {
        setError('DOGly non riesce a rispondere in questo momento.');
        setVoiceState('error');
      }
    },
    [dogId, ensureSession],
  );

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

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

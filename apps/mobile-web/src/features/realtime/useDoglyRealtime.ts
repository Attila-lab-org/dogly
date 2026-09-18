import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createRealtimeSession,
  createRealtimeTurn,
  decideRealtimeMemory,
  endRealtimeSession,
  getRealtimeClientSecret,
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

export function useDoglyRealtime(dogId: string) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
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
  const handledCallsRef = useRef(new Set<string>());
  const sessionRef = useRef<string | null>(null);

  const closeMedia = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.remove();
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    handledCallsRef.current.clear();
  }, []);

  const handleToolCall = useCallback(async (event: RealtimeServerEvent) => {
    const activeSession = sessionRef.current;
    const channel = channelRef.current;
    const callId = event.call_id;
    if (
      !activeSession ||
      !channel ||
      !callId ||
      handledCallsRef.current.has(callId)
    ) {
      return;
    }
    handledCallsRef.current.add(callId);
    setVoiceState('thinking');
    try {
      const args = JSON.parse(event.arguments ?? '{}') as { user_text?: string };
      const userText = args.user_text?.trim();
      if (!userText) throw new Error('Trascrizione non disponibile');
      setTranscript(userText);
      const turn = await createRealtimeTurn(activeSession, userText);
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

  const handleServerEvent = useCallback(
    (event: RealtimeServerEvent) => {
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
          break;
      }
    },
    [handleToolCall],
  );

  const connect = useCallback(async () => {
    if (Platform.OS !== 'web' || !dogId || voiceState === 'connecting') return;
    setError(null);
    setVoiceState('connecting');
    try {
      const session = await createRealtimeSession(dogId, 'VOICE');
      sessionRef.current = session.id;
      setSessionId(session.id);
      const secret = await getRealtimeClientSecret(session.id);

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      peer.addTrack(stream.getAudioTracks()[0], stream);

      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.addEventListener('message', (message) => {
        handleServerEvent(JSON.parse(message.data) as RealtimeServerEvent);
      });
      channel.addEventListener('open', () => setVoiceState('listening'));
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
      setSessionId(null);
      setError(
        'Non riesco ad aprire il microfono. Puoi continuare scrivendo a DOGly.',
      );
      setVoiceState('error');
    }
  }, [closeMedia, dogId, handleServerEvent, voiceState]);

  const disconnect = useCallback(async () => {
    closeMedia();
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setSessionId(null);
    setVoiceState('idle');
    if (activeSession) await endRealtimeSession(activeSession).catch(() => undefined);
  }, [closeMedia]);

  const sendText = useCallback(
    async (text: string) => {
      if (!dogId || !text.trim()) return;
      setError(null);
      setVoiceState('thinking');
      try {
        let activeSession = sessionRef.current;
        if (!activeSession) {
          const session = await createRealtimeSession(dogId, 'TEXT');
          activeSession = session.id;
          sessionRef.current = session.id;
          setSessionId(session.id);
        }
        setTranscript(text.trim());
        const turn = await createRealtimeTurn(activeSession, text.trim());
        setLastTurn(turn);
        setAssistantDraft(turn.assistant_text);
        setVoiceState('idle');
      } catch {
        setError('DOGly non riesce a rispondere in questo momento.');
        setVoiceState('error');
      }
    },
    [dogId],
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

  useEffect(() => () => closeMedia(), [closeMedia]);

  return {
    voiceSupported: Platform.OS === 'web' && typeof RTCPeerConnection !== 'undefined',
    voiceState,
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

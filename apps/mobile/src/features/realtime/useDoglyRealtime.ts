import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';
import { setAudioModeAsync } from 'expo-audio';
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

type ResponsePhase = 'idle' | 'generating' | 'draining' | 'cooldown';

// `response.done` means generation ended. With WebRTC the audio buffer can
// still be draining, so we reopen the microphone only after the drain event.
const RESPONSE_DRAIN_FALLBACK_MS = 1000;
const MIC_REENABLE_DELAY_MS = 250;

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
  const assistantOutputRef = useRef('');
  const assistantFallbackRef = useRef('');
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const greetingRef = useRef(false);
  const responsePhaseRef = useRef<ResponsePhase>('idle');
  const responseAudioDrainedRef = useRef(false);
  const assistantTranscriptSourceRef = useRef<'output' | 'audio' | null>(null);
  const pendingTextQueueRef = useRef<string[]>([]);
  const responseDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedByUserRef = useRef(false);
  const connectInFlightRef = useRef(false);

  const closeMedia = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    outgoingTrackRef.current = null;
    persistQueueRef.current = Promise.resolve();
    greetingRef.current = false;
    responsePhaseRef.current = 'idle';
    responseAudioDrainedRef.current = false;
    assistantOutputRef.current = '';
    assistantFallbackRef.current = '';
    assistantTranscriptSourceRef.current = null;
    pendingTextQueueRef.current = [];
    if (responseDrainTimerRef.current) clearTimeout(responseDrainTimerRef.current);
    if (micReleaseTimerRef.current) clearTimeout(micReleaseTimerRef.current);
    responseDrainTimerRef.current = null;
    micReleaseTimerRef.current = null;
  }, []);

  const setMicEnabled = useCallback((enabled: boolean) => {
    const track = outgoingTrackRef.current;
    if (!track) return;
    track.enabled = enabled && !mutedByUserRef.current;
  }, []);

  const releaseMicAfterOutput = useCallback(() => {
    if (micReleaseTimerRef.current) clearTimeout(micReleaseTimerRef.current);
    responsePhaseRef.current = 'cooldown';
    setMicEnabled(false);
    setVoiceState('speaking');
    micReleaseTimerRef.current = setTimeout(() => {
      micReleaseTimerRef.current = null;
      if (responsePhaseRef.current === 'cooldown') {
        responsePhaseRef.current = 'idle';
        setMicEnabled(true);
        setVoiceState('listening');
      }
    }, MIC_REENABLE_DELAY_MS);
  }, [setMicEnabled]);

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

  const persistSpokenTurn = useCallback((userText: string, assistantText: string) => {
    const sessionId = sessionRef.current;
    const user = userText.trim();
    const assistant = assistantText.trim();
    if (!sessionId || !user || !assistant) return;
    persistQueueRef.current = persistQueueRef.current.then(async () => {
      try {
        const turn = await createRealtimeTurn(sessionId, user, assistant);
        setLastTurn(turn);
      } catch {
        // Voice already answered; audit persistence must never block the conversation.
      }
    });
  }, []);

  const startTextResponse = useCallback((text: string) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open' || greetingRef.current) return false;
    if (micReleaseTimerRef.current) {
      clearTimeout(micReleaseTimerRef.current);
      micReleaseTimerRef.current = null;
    }
    responsePhaseRef.current = 'generating';
    responseAudioDrainedRef.current = false;
    setMicEnabled(false);
    userTranscriptRef.current = text;
    assistantRef.current = '';
    assistantOutputRef.current = '';
    assistantFallbackRef.current = '';
    assistantTranscriptSourceRef.current = null;
    setTranscript(text);
    setAssistantDraft('');
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
    setVoiceState('speaking');
    return true;
  }, [setMicEnabled]);

  const sendVoiceText = useCallback(
    (text: string) => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open' || greetingRef.current) {
        return false;
      }
      if (responsePhaseRef.current !== 'idle') {
        pendingTextQueueRef.current.push(text);
        setTranscript(text);
        setAssistantDraft('');
        setVoiceState('thinking');
        return true;
      }
      return startTextResponse(text);
    },
    [startTextResponse],
  );

  const finalizeResponse = useCallback(() => {
    if (
      responsePhaseRef.current !== 'draining'
    ) {
      return;
    }
    responsePhaseRef.current = 'idle';
    responseAudioDrainedRef.current = true;
    if (responseDrainTimerRef.current) {
      clearTimeout(responseDrainTimerRef.current);
      responseDrainTimerRef.current = null;
    }
    if (greetingRef.current) {
      greetingRef.current = false;
      releaseMicAfterOutput();
      return;
    }
    persistSpokenTurn(userTranscriptRef.current, assistantRef.current);
    const nextText = pendingTextQueueRef.current.shift();
    if (nextText) {
      startTextResponse(nextText);
      return;
    }
    releaseMicAfterOutput();
  }, [persistSpokenTurn, releaseMicAfterOutput, startTextResponse]);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          if (greetingRef.current) return;
          // The track is muted while DOGly speaks. Ignore residual VAD events
          // so speaker bleed cannot erase the answer or create a second turn.
          if (responsePhaseRef.current !== 'idle' || micReleaseTimerRef.current) break;
          userTranscriptRef.current = '';
          assistantRef.current = '';
          assistantOutputRef.current = '';
          assistantFallbackRef.current = '';
          assistantTranscriptSourceRef.current = null;
          setTranscript('');
          setAssistantDraft('');
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
          responsePhaseRef.current = 'generating';
          responseAudioDrainedRef.current = false;
          if (micReleaseTimerRef.current) {
            clearTimeout(micReleaseTimerRef.current);
            micReleaseTimerRef.current = null;
          }
          assistantTranscriptSourceRef.current = null;
          assistantOutputRef.current = '';
          assistantFallbackRef.current = '';
          setMicEnabled(false);
          break;
        case 'response.output_audio_transcript.delta':
          assistantTranscriptSourceRef.current = 'output';
          if (event.delta) {
            assistantOutputRef.current += event.delta;
            assistantRef.current = assistantOutputRef.current;
            setAssistantDraft(assistantRef.current);
          }
          setVoiceState('speaking');
          break;
        case 'response.audio_transcript.delta':
          if (assistantTranscriptSourceRef.current === 'output') break;
          assistantTranscriptSourceRef.current = 'audio';
          if (event.delta) {
            assistantFallbackRef.current += event.delta;
            assistantRef.current = assistantFallbackRef.current;
            setAssistantDraft(assistantRef.current);
          }
          setVoiceState('speaking');
          break;
        case 'response.output_audio_transcript.done':
          assistantTranscriptSourceRef.current = 'output';
          if (event.transcript) {
            assistantOutputRef.current = event.transcript;
            assistantRef.current = assistantOutputRef.current;
            setAssistantDraft(event.transcript);
          }
          break;
        case 'response.audio_transcript.done':
          if (assistantTranscriptSourceRef.current === 'output') break;
          assistantTranscriptSourceRef.current = 'audio';
          if (event.transcript) {
            assistantFallbackRef.current = event.transcript;
            assistantRef.current = assistantFallbackRef.current;
            setAssistantDraft(event.transcript);
          }
          break;
        case 'response.done':
          if (responsePhaseRef.current !== 'generating') break;
          responsePhaseRef.current = 'draining';
          // `response.done` is not the end of WebRTC playback. Wait for the
          // output buffer to drain, with a bounded fallback for older clients.
          if (responseAudioDrainedRef.current) {
            finalizeResponse();
          } else {
            if (responseDrainTimerRef.current) clearTimeout(responseDrainTimerRef.current);
            responseDrainTimerRef.current = setTimeout(() => {
              responseDrainTimerRef.current = null;
              responseAudioDrainedRef.current = true;
              finalizeResponse();
            }, RESPONSE_DRAIN_FALLBACK_MS);
          }
          break;
        case 'output_audio_buffer.stopped':
          responseAudioDrainedRef.current = true;
          if (responsePhaseRef.current === 'draining') finalizeResponse();
          break;
        case 'response.cancelled':
          if (responsePhaseRef.current === 'idle') break;
          responsePhaseRef.current = 'idle';
          responseAudioDrainedRef.current = true;
          if (responseDrainTimerRef.current) {
            clearTimeout(responseDrainTimerRef.current);
            responseDrainTimerRef.current = null;
          }
          if (greetingRef.current) {
            greetingRef.current = false;
            setMicEnabled(true);
            setVoiceState('listening');
            return;
          }
          const queuedText = pendingTextQueueRef.current.shift();
          if (queuedText) {
            startTextResponse(queuedText);
            return;
          }
          userTranscriptRef.current = '';
          assistantRef.current = '';
          assistantOutputRef.current = '';
          assistantFallbackRef.current = '';
          assistantTranscriptSourceRef.current = null;
          setAssistantDraft('');
          setMicEnabled(true);
          setVoiceState('listening');
          break;
        case 'error':
          setError(event.error?.message ?? 'La voce DOGly si è interrotta.');
          setVoiceState('error');
      }
    },
    [finalizeResponse, setMicEnabled, startTextResponse],
  );

  const connect = useCallback(async () => {
    if (!dogId || voiceState === 'connecting' || connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    setError(null);
    setVoiceState('connecting');
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
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
        responsePhaseRef.current = 'generating';
        responseAudioDrainedRef.current = false;
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
    } finally {
      connectInFlightRef.current = false;
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
    if (mutedByUserRef.current) {
      setMicEnabled(false);
    } else if (responsePhaseRef.current === 'idle') {
      setMicEnabled(true);
    }
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
    // Do not create a server session just by opening the screen. A session
    // starts only when the owner connects or sends a text turn.
    return () => {
      closeMedia();
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      sessionDataRef.current = null;
      if (sessionId) {
        void endRealtimeSession(sessionId).catch(() => undefined);
      }
    };
  }, [closeMedia]);

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

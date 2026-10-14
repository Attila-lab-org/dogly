/**
 * Browser WebRTC bridge for OpenAI Realtime (ephemeral client secret).
 *
 * Talk mode: echo-safe for human conversation.
 * Dog mode: open the mic to ambient vocalizations (barks) — Realtime VAD and
 * near_field NR otherwise treat them as noise and only “hear” the owner.
 */

export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'ended'
  | 'error';

export type LiveListenMode = 'talk' | 'dog';

export type LiveWebRtcHandle = {
  stop: () => void;
  getAnalyserLevel: () => number;
  setListenMode: (mode: LiveListenMode) => void;
  /** Capture ~windowMs of ambient audio, then ask DOGly to read any bark. */
  listenForBark: (dogName: string, windowMs?: number) => Promise<void>;
};

type ConnectOptions = {
  clientSecret: string;
  onState: (state: LiveConnectionState) => void;
  onRemoteTrack?: (stream: MediaStream) => void;
  onError?: (message: string) => void;
  onListenMode?: (mode: LiveListenMode) => void;
};

function peerSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined';
}

function sendEvent(channel: RTCDataChannel | null, payload: Record<string, unknown>) {
  if (!channel || channel.readyState !== 'open') return;
  channel.send(JSON.stringify(payload));
}

function talkSessionUpdate() {
  return {
    type: 'session.update',
    session: {
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
        create_response: true,
        interrupt_response: true,
      },
      // far_field keeps room sound; near_field was killing dog barks.
      input_audio_noise_reduction: { type: 'far_field' },
    },
  };
}

function dogSessionUpdate() {
  return {
    type: 'session.update',
    session: {
      turn_detection: {
        type: 'server_vad',
        // Lower bar so loud barks can enter the buffer (still volume-based).
        threshold: 0.28,
        prefix_padding_ms: 400,
        silence_duration_ms: 900,
        create_response: false,
        interrupt_response: false,
      },
      // Off: NR treats non-speech vocalizations as noise.
      input_audio_noise_reduction: null,
    },
  };
}

async function applyTrackMode(
  stream: MediaStream | null,
  mode: LiveListenMode,
) {
  if (!stream) return;
  for (const track of stream.getAudioTracks()) {
    try {
      await track.applyConstraints({
        echoCancellation: true,
        // Browser NS also strips barks — off in dog mode.
        noiseSuppression: mode === 'talk',
        autoGainControl: true,
      });
    } catch {
      /* older browsers */
    }
  }
}

export async function connectLiveWebRtc(
  options: ConnectOptions,
): Promise<LiveWebRtcHandle> {
  if (!peerSupported()) {
    throw new Error('WebRTC non disponibile su questo dispositivo');
  }

  options.onState('connecting');
  const pc = new RTCPeerConnection();

  const audioEl =
    typeof document !== 'undefined' ? document.createElement('audio') : null;
  if (audioEl) {
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.setAttribute('webkit-playsinline', 'true');
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }

  let localStream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let closed = false;
  let remoteStreamId: string | null = null;
  let listenMode: LiveListenMode = 'talk';
  let barkTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (barkTimer) clearTimeout(barkTimer);
    try {
      dataChannel?.close();
    } catch {
      /* ignore */
    }
    try {
      pc.close();
    } catch {
      /* ignore */
    }
    localStream?.getTracks().forEach((track) => track.stop());
    void audioCtx?.close();
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
    }
    options.onState('ended');
  };

  const setListenMode = (mode: LiveListenMode) => {
    listenMode = mode;
    options.onListenMode?.(mode);
    void applyTrackMode(localStream, mode);
    sendEvent(
      dataChannel,
      mode === 'dog' ? dogSessionUpdate() : talkSessionUpdate(),
    );
  };

  const listenForBark = async (dogName: string, windowMs = 6500) => {
    if (closed || !dataChannel) return;
    setListenMode('dog');
    options.onState('listening');
    await new Promise<void>((resolve) => {
      if (barkTimer) clearTimeout(barkTimer);
      barkTimer = setTimeout(() => resolve(), windowMs);
    });
    if (closed) return;
    // Ask the model to interpret whatever canine audio just entered the buffer.
    sendEvent(dataChannel, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              `Ho avvicinato il microfono a ${dogName} per circa ${Math.round(windowMs / 1000)} secondi. ` +
              `Se nell'audio c'è un abbaio o un vocalizzo del cane, fallo sentire nella lettura: ` +
              `di' cosa comunica in parole umane, ancorandoti a questo cane e al momento. ` +
              `Se l'audio è troppo debole o confuso, dillo in una frase e chiedi un dettaglio. ` +
              `Non dire che non puoi interpretare gli abbai.`,
          },
        ],
      },
    });
    sendEvent(dataChannel, { type: 'response.create' });
    setListenMode('talk');
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream || !audioEl) return;
    if (remoteStreamId && remoteStreamId === stream.id) return;
    remoteStreamId = stream.id;
    audioEl.srcObject = stream;
    void audioEl.play().catch(() => undefined);
    options.onRemoteTrack?.(stream);
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream);
    }
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(localStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      analyser = null;
    }
  } catch {
    cleanup();
    throw new Error('Serve il microfono per parlare con DOGly');
  }

  dataChannel = pc.createDataChannel('oai-events');
  dataChannel.addEventListener('open', () => {
    sendEvent(dataChannel, talkSessionUpdate());
  });
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string };
      const type = payload.type ?? '';
      if (
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio.delta' ||
        type === 'output_audio_buffer.started' ||
        type === 'response.created'
      ) {
        options.onState('speaking');
        return;
      }
      if (
        type === 'response.done' ||
        type === 'output_audio_buffer.stopped' ||
        type === 'input_audio_buffer.speech_started'
      ) {
        options.onState('listening');
      }
    } catch {
      /* ignore non-json */
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, 1500);
  });

  const sdp = pc.localDescription?.sdp;
  if (!sdp) {
    cleanup();
    throw new Error('Connessione vocale non riuscita');
  }

  const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: sdp,
    headers: {
      Authorization: `Bearer ${options.clientSecret}`,
      'Content-Type': 'application/sdp',
    },
  });
  if (!sdpResponse.ok) {
    cleanup();
    options.onError?.(`Live ${sdpResponse.status}`);
    throw new Error('OpenAI Live non ha accettato la connessione');
  }
  const answer = await sdpResponse.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  options.onState('listening');

  return {
    stop: cleanup,
    getAnalyserLevel: () => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      return Math.min(1, sum / (data.length * 180));
    },
    setListenMode,
    listenForBark,
  };
}

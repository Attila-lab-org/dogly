/**
 * Browser WebRTC bridge for OpenAI Realtime (ephemeral client secret).
 * Native without RTCPeerConnection falls back to unsupported.
 */

export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'ended'
  | 'error';

export type LiveWebRtcHandle = {
  stop: () => void;
  getAnalyserLevel: () => number;
};

type ConnectOptions = {
  clientSecret: string;
  onState: (state: LiveConnectionState) => void;
  onRemoteTrack?: (stream: MediaStream) => void;
  onError?: (message: string) => void;
};

function peerSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined';
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
    (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }

  let localStream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
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
    }
    options.onState('ended');
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (audioEl && stream) {
      audioEl.srcObject = stream;
      void audioEl.play().catch(() => undefined);
    }
    options.onRemoteTrack?.(stream);
    // Crude speaking detect: remote track active ⇒ DOGly speaking.
    options.onState('speaking');
    setTimeout(() => {
      if (!closed) options.onState('listening');
    }, 1200);
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string };
      if (payload.type === 'response.audio_transcript.delta' || payload.type === 'response.output_audio.delta') {
        options.onState('speaking');
      }
      if (
        payload.type === 'response.done' ||
        payload.type === 'output_audio_buffer.stopped' ||
        payload.type === 'input_audio_buffer.speech_started'
      ) {
        options.onState('listening');
      }
    } catch {
      /* ignore non-json */
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait briefly for ICE gathering (enough for most browsers).
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
    }, 1200);
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
  };
}

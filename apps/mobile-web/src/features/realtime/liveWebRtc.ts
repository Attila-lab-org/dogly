/**
 * Browser WebRTC bridge for OpenAI Realtime (ephemeral client secret).
 * Tuned against echo (speakers → mic) which makes Live feel “double”
 * and appear not to listen.
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

function sendEvent(channel: RTCDataChannel, payload: Record<string, unknown>) {
  if (channel.readyState !== 'open') return;
  channel.send(JSON.stringify(payload));
}

export async function connectLiveWebRtc(
  options: ConnectOptions,
): Promise<LiveWebRtcHandle> {
  if (!peerSupported()) {
    throw new Error('WebRTC non disponibile su questo dispositivo');
  }

  options.onState('connecting');
  const pc = new RTCPeerConnection();

  // Single remote playback element — never attach the local mic stream here
  // or the user hears themselves (“mi sento doppio”).
  const audioEl =
    typeof document !== 'undefined' ? document.createElement('audio') : null;
  if (audioEl) {
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.setAttribute('webkit-playsinline', 'true');
    // Keep remote only; hide from layout.
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }

  let localStream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let closed = false;
  let remoteStreamId: string | null = null;

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
      audioEl.remove();
    }
    options.onState('ended');
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream || !audioEl) return;
    // Only bind once — duplicate ontrack makes the voice feel doubled.
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
        // Prefer voice-tuned constraints when the browser supports them.
        channelCount: 1,
      },
      video: false,
    });
    for (const track of localStream.getAudioTracks()) {
      // Soften echo on Chromium when available.
      try {
        await track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
      } catch {
        /* older browsers */
      }
      pc.addTrack(track, localStream);
    }
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(localStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      // Analyser only — never connect to destination (that would play the mic).
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
    // Near-field + slightly longer silence so DOGly waits for you to finish
    // instead of interrupting / looping on speaker bleed.
    sendEvent(dataChannel!, {
      type: 'session.update',
      session: {
        turn_detection: {
          type: 'server_vad',
          threshold: 0.55,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: true,
          interrupt_response: true,
        },
        input_audio_noise_reduction: { type: 'near_field' },
      },
    });
  });
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as {
        type?: string;
      };
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
  };
}

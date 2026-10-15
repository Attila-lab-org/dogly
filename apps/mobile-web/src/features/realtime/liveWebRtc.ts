/**
 * Browser WebRTC bridge for OpenAI GPT-Live.
 *
 * The browser builds an SDP offer; our backend POSTs it to
 * /v1/live/sessions (project API key stays server-side) and returns the
 * SDP answer. Always open to room audio (dog barks included): echoCancellation
 * on, browser noiseSuppression off.
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

export type LiveSdpExchangeResult = {
  answerSdp: string;
};

type ConnectOptions = {
  /** Exchange local SDP offer for OpenAI GPT-Live answer via our API. */
  exchangeOffer: (offerSdp: string) => Promise<LiveSdpExchangeResult>;
  onState: (state: LiveConnectionState) => void;
  onRemoteTrack?: (stream: MediaStream) => void;
  onError?: (message: string) => void;
};

function peerSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined';
}

function sendEvent(channel: RTCDataChannel | null, payload: Record<string, unknown>) {
  if (!channel || channel.readyState !== 'open') return;
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
  let finalized = false;
  let remoteStreamId: string | null = null;
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
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

  const requestGracefulClose = () => {
    if (closed || finalized) {
      cleanup();
      return;
    }
    if (dataChannel && dataChannel.readyState === 'open') {
      sendEvent(dataChannel, { type: 'session.close' });
      closeTimeout = setTimeout(() => cleanup(), 8_000);
      return;
    }
    cleanup();
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
    // echoCancellation: keep (stops “mi sento doppio”)
    // noiseSuppression: OFF — Chromium NS often nukes dog barks as “noise”
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    for (const track of localStream.getAudioTracks()) {
      try {
        await track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: false,
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
      source.connect(analyser);
    } catch {
      analyser = null;
    }
  } catch {
    cleanup();
    throw new Error('Serve il microfono per parlare con DOGly');
  }

  // Create the event channel before the SDP offer (required by GPT-Live).
  dataChannel = pc.createDataChannel('oai-events');
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string };
      const type = payload.type ?? '';
      if (type === 'session.started') {
        options.onState('listening');
        return;
      }
      if (type === 'session.closed') {
        finalized = true;
        cleanup();
        return;
      }
      if (
        type === 'session.output_transcript.delta' ||
        type === 'session.output_audio.delta' ||
        type === 'response.output_audio.delta' ||
        type === 'response.audio_transcript.delta' ||
        type === 'output_audio_buffer.started' ||
        type === 'response.created'
      ) {
        options.onState('speaking');
        return;
      }
      if (
        type === 'session.input_transcript.delta' ||
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
  dataChannel.addEventListener('close', () => {
    if (!finalized && !closed) {
      cleanup();
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      // Prefer a partial candidate set over hanging forever.
      resolve();
    }, 10_000);
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });

  const sdp = pc.localDescription?.sdp;
  if (!sdp) {
    cleanup();
    throw new Error('Connessione vocale non riuscita');
  }

  let answerSdp: string;
  try {
    const exchanged = await options.exchangeOffer(sdp);
    answerSdp = exchanged.answerSdp;
  } catch (err) {
    cleanup();
    const message =
      err instanceof Error ? err.message : 'OpenAI Live non ha accettato la connessione';
    options.onError?.(message);
    throw err instanceof Error ? err : new Error(message);
  }

  if (!answerSdp?.trim()) {
    cleanup();
    options.onError?.('Live senza risposta SDP');
    throw new Error('OpenAI Live non ha accettato la connessione');
  }

  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  // HTTP create starts the session — do not send session.start.
  // Stay on "connecting" until session.started (or audio arrives).
  options.onState('connecting');

  return {
    stop: requestGracefulClose,
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

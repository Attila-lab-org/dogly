/**
 * Registrazione video sul browser. expo-camera su web ha recordAsync
 * finto: ritorna uri vuoto e stopRecording non fa nulla.
 *
 * Non cloniamo e non stoppiamo i track della preview: fermarli spegne
 * la fotocamera, e su Safari i track clonati spesso non producono dati.
 */
import { rememberWebClipBlob } from '../../lib/webClipBlob';

export type WebVideoRecording = {
  finished: Promise<string | null>;
  stop: () => void;
  hasAudio: boolean;
  mimeType: string;
};

function findPreviewStream(): MediaStream | null {
  if (typeof document === 'undefined') return null;
  const videos = Array.from(document.querySelectorAll('video'));
  const scored = videos
    .map((video) => {
      const stream = video.srcObject;
      if (!(stream instanceof MediaStream)) return null;
      const live = stream
        .getVideoTracks()
        .some((track) => track.readyState === 'live');
      if (!live) return null;
      const style = window.getComputedStyle(video);
      const hidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0;
      const box = video.getBoundingClientRect();
      const area = Math.max(0, box.width) * Math.max(0, box.height);
      return {
        stream,
        score:
          (hidden ? 0 : 1_000_000) +
          area +
          (video.readyState >= 2 ? 100 : 0),
      };
    })
    .filter((item): item is { stream: MediaStream; score: number } => item !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.stream ?? null;
}

function pickMimeType(hasAudio: boolean): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const withAudio = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  const videoOnly = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4',
  ];
  return (hasAudio ? withAudio : videoOnly).find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

function containerMime(value: string | undefined): string {
  const type = (value ?? '').split(';', 1)[0].toLowerCase();
  if (type === 'video/mp4' || type === 'video/quicktime') return type;
  return type || 'video/webm';
}

/** Video leggero e audio ambientale nitido: 15 secondi restano pochi MB. */
const RECORD_VIDEO_BPS = 1_200_000;
const RECORD_AUDIO_BPS = 96_000;

async function limitVideoTrack(track: MediaStreamTrack): Promise<void> {
  try {
    await track.applyConstraints({
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 24, max: 24 },
    });
  } catch {
    // Safari può rifiutare i vincoli: registriamo comunque.
  }
}

function createRecorder(stream: MediaStream, mimeType?: string): MediaRecorder {
  const attempts: MediaRecorderOptions[] = [];
  if (mimeType) {
    attempts.push({
      mimeType,
      videoBitsPerSecond: RECORD_VIDEO_BPS,
      audioBitsPerSecond: RECORD_AUDIO_BPS,
    });
    attempts.push({ mimeType, bitsPerSecond: RECORD_VIDEO_BPS + RECORD_AUDIO_BPS });
    attempts.push({ mimeType });
  } else {
    attempts.push({
      videoBitsPerSecond: RECORD_VIDEO_BPS,
      audioBitsPerSecond: RECORD_AUDIO_BPS,
    });
  }
  for (const options of attempts) {
    try {
      return new MediaRecorder(stream, options);
    } catch {
      // Prova la combinazione successiva.
    }
  }
  return new MediaRecorder(stream);
}

async function attachMicrophone(stream: MediaStream): Promise<MediaStreamTrack[]> {
  if (stream.getAudioTracks().some((track) => track.readyState === 'live')) {
    return [];
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return [];
  }
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      // I filtri delle chiamate possono attenuare abbai, ringhi e guaiti.
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const added: MediaStreamTrack[] = [];
    for (const track of mic.getAudioTracks()) {
      stream.addTrack(track);
      added.push(track);
    }
    return added;
  } catch {
    return [];
  }
}

export async function startWebVideoRecording(
  options: { includeAudio?: boolean } = {},
): Promise<WebVideoRecording> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error(
      'Questo browser non può registrare video. Apri Dogly in Chrome o Safari aggiornato.',
    );
  }
  const preview = findPreviewStream();
  if (!preview) {
    throw new Error('Fotocamera non pronta. Attendi l’anteprima e riprova.');
  }

  const ownedTracks: MediaStreamTrack[] = [];
  const stream = new MediaStream();
  for (const track of preview.getVideoTracks()) {
    if (track.readyState === 'live') {
      stream.addTrack(track);
      await limitVideoTrack(track);
    }
  }
  if (stream.getVideoTracks().length === 0) {
    throw new Error('Fotocamera non pronta. Attendi l’anteprima e riprova.');
  }

  if (options.includeAudio !== false) {
    ownedTracks.push(...(await attachMicrophone(stream)));
  }

  const hasAudio = stream
    .getAudioTracks()
    .some(
      (track) =>
        track.readyState === 'live' && track.enabled && !track.muted,
    );
  const mimeType = pickMimeType(hasAudio);
  const recorder = createRecorder(stream, mimeType);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  let settled = false;
  let resolveFinished: (uri: string | null) => void = () => undefined;
  const finished = new Promise<string | null>((resolve) => {
    resolveFinished = resolve;
  });

  const releaseOwnedTracks = () => {
    for (const track of ownedTracks) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    ownedTracks.length = 0;
  };

  const blobFromChunks = (): Blob | null => {
    if (chunks.length === 0) return null;
    const type = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    return blob.size >= 500 ? blob : null;
  };

  const settle = (uri: string | null) => {
    if (settled) return;
    settled = true;
    releaseOwnedTracks();
    resolveFinished(uri);
  };

  const settleFromChunks = () => {
    const blob = blobFromChunks();
    if (!blob) {
      settle(null);
      return;
    }
    const uri = URL.createObjectURL(blob);
    rememberWebClipBlob(uri, blob);
    settle(uri);
  };

  recorder.onstop = settleFromChunks;
  recorder.onerror = settleFromChunks;

  try {
    recorder.start(250);
  } catch {
    recorder.start();
  }

  return {
    finished,
    hasAudio,
    mimeType: containerMime(recorder.mimeType || mimeType),
    stop: () => {
      try {
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          if (recorder.state === 'paused') recorder.resume();
          try {
            recorder.requestData();
          } catch {
            // Safari può non supportare requestData.
          }
          recorder.stop();
          window.setTimeout(() => {
            if (!settled) settleFromChunks();
          }, 8_000);
          return;
        }
        settleFromChunks();
      } catch {
        settleFromChunks();
      }
    },
  };
}

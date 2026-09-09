/**
 * Registrazione video sul browser. expo-camera su web ha recordAsync
 * finto: ritorna uri vuoto e stopRecording non fa nulla.
 */

export type WebVideoRecording = {
  finished: Promise<string | null>;
  stop: () => void;
  hasAudio: boolean;
};

function findPreviewStream(): MediaStream | null {
  if (typeof document === 'undefined') return null;
  const videos = Array.from(document.querySelectorAll('video'));
  const scored = videos
    .map((video) => {
      const stream = video.srcObject;
      if (!(stream instanceof MediaStream)) return null;
      const live = stream.getVideoTracks().some((track) => track.readyState === 'live');
      if (!live) return null;
      const style = window.getComputedStyle(video);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const box = video.getBoundingClientRect();
      const area = Math.max(0, box.width) * Math.max(0, box.height);
      if (area < 4) return null;
      return { stream, area };
    })
    .filter((item): item is { stream: MediaStream; area: number } => item !== null)
    .sort((a, b) => b.area - a.area);
  return scored[0]?.stream ?? null;
}

function cloneLiveStream(stream: MediaStream): MediaStream {
  const cloned = new MediaStream();
  for (const track of stream.getTracks()) {
    if (track.readyState === 'live') {
      cloned.addTrack(track.clone());
    }
  }
  return cloned;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function attachMicrophone(stream: MediaStream): Promise<boolean> {
  if (stream.getAudioTracks().some((track) => track.readyState === 'live')) {
    return true;
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    let added = false;
    for (const track of mic.getAudioTracks()) {
      stream.addTrack(track);
      added = true;
    }
    return added;
  } catch {
    return false;
  }
}

export async function startWebVideoRecording(
  options: { includeAudio?: boolean } = {},
): Promise<WebVideoRecording> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Questo browser non può registrare video.');
  }
  const preview = findPreviewStream();
  if (!preview) {
    throw new Error('Fotocamera non pronta. Attendi l’anteprima e riprova.');
  }

  const stream = cloneLiveStream(preview);
  if (stream.getVideoTracks().length === 0) {
    throw new Error('Fotocamera non pronta. Attendi l’anteprima e riprova.');
  }

  const hasAudio =
    options.includeAudio === false ? false : await attachMicrophone(stream);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
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

  const settle = (uri: string | null) => {
    if (settled) return;
    settled = true;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    resolveFinished(uri);
  };

  recorder.onstop = () => {
    const type = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    if (blob.size < 500) {
      settle(null);
      return;
    }
    settle(URL.createObjectURL(blob));
  };
  recorder.onerror = () => {
    settle(null);
  };

  recorder.start(250);

  return {
    finished,
    hasAudio,
    stop: () => {
      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
          recorder.stop();
        } else if (recorder.state === 'paused') {
          recorder.resume();
          recorder.requestData();
          recorder.stop();
        } else {
          settle(null);
        }
      } catch {
        settle(null);
      }
      window.setTimeout(() => settle(null), 1500);
    },
  };
}

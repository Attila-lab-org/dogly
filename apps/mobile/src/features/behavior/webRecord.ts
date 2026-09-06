/**
 * Registrazione video sul browser. expo-camera su web ha recordAsync
 * finto: ritorna uri vuoto e stopRecording non fa nulla.
 */

export type WebVideoRecording = {
  finished: Promise<string | null>;
  stop: () => void;
};

function findPreviewStream(): MediaStream | null {
  if (typeof document === 'undefined') return null;
  const videos = Array.from(document.querySelectorAll('video'));
  for (const video of videos) {
    const stream = video.srcObject;
    if (stream instanceof MediaStream && stream.getVideoTracks().length > 0) {
      return stream;
    }
  }
  return null;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function startWebVideoRecording(): WebVideoRecording {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Questo browser non può registrare video.');
  }
  const stream = findPreviewStream();
  if (!stream) {
    throw new Error('Fotocamera non pronta. Attendi l’anteprima e riprova.');
  }

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

  let resolveFinished: (uri: string | null) => void = () => undefined;
  const finished = new Promise<string | null>((resolve) => {
    resolveFinished = resolve;
  });

  recorder.onstop = () => {
    const type = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    if (blob.size < 500) {
      resolveFinished(null);
      return;
    }
    resolveFinished(URL.createObjectURL(blob));
  };
  recorder.onerror = () => {
    resolveFinished(null);
  };

  recorder.start(250);

  return {
    finished,
    stop: () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  };
}

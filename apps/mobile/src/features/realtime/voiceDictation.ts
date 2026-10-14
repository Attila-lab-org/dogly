/**
 * Dictation helper: web SpeechRecognition, native expo-audio + server STT.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { api } from '@/lib/apiClient';

type ContentType = 'audio/m4a' | 'audio/mp4' | 'audio/webm' | 'audio/wav' | 'audio/mpeg';

export type DictationHandle = {
  stop: () => void;
};

export async function transcribeVoiceClip(
  audioBase64: string,
  contentType: ContentType = 'audio/m4a',
): Promise<string> {
  const result = await api.post<{ text: string }>(
    '/v1/voice/transcribe',
    { audio_base64: audioBase64, content_type: contentType },
    { timeoutMs: 100_000 },
  );
  return (result.text || '').trim();
}

export async function startNativeDictation(options: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onStateChange?: (recording: boolean) => void;
}): Promise<DictationHandle | null> {
  if (Platform.OS === 'web') return null;

  const audio = await import('expo-audio');
  const permission = await audio.requestRecordingPermissionsAsync();
  if (!permission.granted) {
    options.onError('Serve il permesso microfono per dettare.');
    return null;
  }

  await audio.setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });

  const recorder = new audio.AudioModule.AudioRecorder(audio.RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();
  options.onStateChange?.(true);

  let stopped = false;
  const finish = async () => {
    if (stopped) return;
    stopped = true;
    options.onStateChange?.(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        options.onError('Non ho registrato audio. Riprova.');
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const text = await transcribeVoiceClip(base64, 'audio/m4a');
      if (!text) {
        options.onError('Non ho capito bene. Puoi riprovare?');
        return;
      }
      options.onTranscript(text);
    } catch {
      options.onError('La dettatura non è riuscita. Riprova tra poco.');
    }
  };

  // Cap native clips at ~25s so STT stays snappy and within budget.
  const timer = setTimeout(() => {
    void finish();
  }, 25_000);

  return {
    stop: () => {
      clearTimeout(timer);
      void finish();
    },
  };
}

export function startWebDictation(options: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onStateChange?: (recording: boolean) => void;
}): DictationHandle | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const browserWindow = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };
  const SpeechRecognition =
    browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    options.onError('La dettatura non è disponibile in questo browser.');
    return null;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'it-IT';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => options.onStateChange?.(true);
  recognition.onresult = (event: any) => {
    const text = String(event.results?.[0]?.[0]?.transcript || '').trim();
    if (text) options.onTranscript(text);
  };
  recognition.onerror = () => {
    options.onStateChange?.(false);
    options.onError('Non ho capito la dettatura. Puoi riprovare.');
  };
  recognition.onend = () => options.onStateChange?.(false);
  recognition.start();
  return {
    stop: () => {
      // Always clear UI state immediately. Chrome sometimes never fires
      // onend after recognition.stop() (permission race / already-ended).
      options.onStateChange?.(false);
      try {
        recognition.abort();
      } catch {
        try {
          recognition.stop();
        } catch {
          // already stopped
        }
      }
    },
  };
}

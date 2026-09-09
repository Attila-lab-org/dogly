import type { AudioSource } from 'expo-audio';
import type { SignalCategory } from './types';

/**
 * Static requires are intentional: Metro bundles and validates every sound at
 * build time, so Signals works offline and cannot load an arbitrary remote URL.
 */
export const SIGNAL_AUDIO_ASSETS: Record<SignalCategory, AudioSource> = {
  ATTENTION: require('../../../assets/signals/attention-soft-01.mp3'),
  PLAY: require('../../../assets/signals/play-invite-01.mp3'),
  CONTACT: require('../../../assets/signals/contact-call-01.mp3'),
  CURIOSITY: require('../../../assets/signals/curiosity-soft-01.mp3'),
};

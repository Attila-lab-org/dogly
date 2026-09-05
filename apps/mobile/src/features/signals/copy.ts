import type {
  SignalCategory,
  SignalCategoryMeta,
  SignalObservedBehavior,
} from './types';

export const SIGNAL_HOME_TITLE = 'Conosci il suo modo di rispondere';
export const SIGNAL_HOME_SUBTITLE = 'Un esperimento semplice, personale, guidato da Dogly.';

export const FORBIDDEN_SIGNAL_COPY = [
  'traduce il linguaggio dei cani',
  'significa vieni',
  'significa no',
  'fa obbedire',
  'scientificamente provato che ha capito',
];

export const SIGNAL_REACTIONS: Array<{
  behavior: SignalObservedBehavior;
  label: string;
  sentence: string;
}> = [
  { behavior: 'HEAD_TURN', label: 'Ha girato la testa', sentence: 'ha girato la testa' },
  { behavior: 'EAR_RAISE', label: 'Ha alzato le orecchie', sentence: 'ha alzato le orecchie' },
  { behavior: 'APPROACH', label: 'Si è avvicinato', sentence: 'si è avvicinato' },
  { behavior: 'PLAY_READY', label: 'Si è preparato al gioco', sentence: 'si è preparato al gioco' },
  { behavior: 'STILL_ATTENTIVE', label: 'È rimasto attento', sentence: 'è rimasto attento' },
  {
    behavior: 'NO_VISIBLE_RESPONSE',
    label: 'Nessuna reazione evidente',
    sentence: 'non ha mostrato una reazione evidente',
  },
];

export const SIGNAL_CATEGORIES: SignalCategoryMeta[] = [
  {
    category: 'ATTENTION',
    title: 'Attenzione',
    shortTitle: 'Attenzione',
    description: 'Segnali che catturano lo sguardo o le orecchie.',
    icon: 'eye-outline',
    soundKey: 'attention-soft-01',
    resultSummary: 'Reazione da confermare dopo l’esperimento.',
    observedBehaviors: ['HEAD_TURN', 'EAR_RAISE'],
  },
  {
    category: 'PLAY',
    title: 'Gioco',
    shortTitle: 'Gioco',
    description: 'Segnali associati a interesse e coinvolgimento.',
    icon: 'tennisball-outline',
    soundKey: 'play-invite-01',
    resultSummary: 'Reazione da confermare dopo l’esperimento.',
    observedBehaviors: ['STILL_ATTENTIVE', 'PLAY_READY'],
  },
  {
    category: 'CONTACT',
    title: 'Contatto',
    shortTitle: 'Contatto',
    description: 'Segnali che possono accompagnare avvicinamento e presenza.',
    icon: 'paw-outline',
    soundKey: 'contact-call-01',
    resultSummary: 'Reazione da confermare dopo l’esperimento.',
    observedBehaviors: ['APPROACH'],
  },
  {
    category: 'CURIOSITY',
    title: 'Curiosità',
    shortTitle: 'Da scoprire',
    description: 'Ancora pochi tentativi per leggere una tendenza.',
    icon: 'sparkles-outline',
    soundKey: 'curiosity-soft-01',
    resultSummary: 'Reazione da confermare dopo l’esperimento.',
    observedBehaviors: ['STILL_ATTENTIVE'],
  },
];

export function metaForCategory(category: SignalCategory): SignalCategoryMeta {
  return SIGNAL_CATEGORIES.find((meta) => meta.category === category) ?? SIGNAL_CATEGORIES[0];
}

export function signalResultSummary(
  dogName: string,
  behaviors: SignalObservedBehavior[],
): string {
  if (behaviors.includes('NO_VISIBLE_RESPONSE') || behaviors.length === 0) {
    return `${dogName} non ha mostrato una reazione evidente.`;
  }
  const sentences = behaviors
    .map((behavior) => SIGNAL_REACTIONS.find((item) => item.behavior === behavior)?.sentence)
    .filter((sentence): sentence is string => Boolean(sentence));
  if (sentences.length === 1) return `${dogName} ${sentences[0]}.`;
  return `${dogName} ${sentences.slice(0, -1).join(', ')} e ${sentences.at(-1)}.`;
}

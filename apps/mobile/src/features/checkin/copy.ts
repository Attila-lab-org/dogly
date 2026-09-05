import type { CheckInFrequency } from './types';

export const FREQUENCY_OPTIONS: Array<{
  id: CheckInFrequency;
  title: string;
  description: string;
}> = [
  {
    id: 'light',
    title: 'Leggero',
    description: 'Qualche volta a settimana, solo un saluto.',
  },
  {
    id: 'normal',
    title: 'Normale',
    description: 'Un saluto quando apri l’app, se manca.',
  },
  {
    id: 'monitoring',
    title: 'Monitoraggio',
    description: 'Più presente per un periodo in cui vuoi stare vicino.',
  },
];

import type { CheckInFrequency } from './types';

export const FREQUENCY_OPTIONS: Array<{
  id: CheckInFrequency;
  title: string;
  description: string;
}> = [
  {
    id: 'light',
    title: 'Ogni 3 giorni',
    description: 'Un breve saluto ogni pochi giorni.',
  },
  {
    id: 'normal',
    title: 'Ogni giorno',
    description: 'Un breve check-in una volta al giorno.',
  },
  {
    id: 'monitoring',
    title: 'A ogni apertura',
    description: 'Un check-in ogni volta che apri DOGly.',
  },
];

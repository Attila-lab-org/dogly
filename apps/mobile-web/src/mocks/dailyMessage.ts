import type { DailyDogMessage } from '../features/dailyMessage/types';
import { DOG_ID, dogMock } from './core';

export const dailyMessageMock: DailyDogMessage = {
  id: 'daily-2026-09-05',
  dogId: DOG_ID,
  dogName: dogMock.name,
  body: 'Oggi mi sento più giocoso: se hai un momento, corriamo un po’ insieme!',
  disclaimer:
    'Messaggio basato sui segnali osservati — interpretazione giocosa, non una traduzione letterale.',
  evidence: [
    'Postura di gioco in un episodio recente',
    'Movimenti verso di te',
    'Vocalizzazione breve',
  ],
  suggestions: ['play', 'walk', 'observe'],
  basedOnEventId: 'evt-play',
  createdAt: '2026-09-05T07:00:00Z',
};

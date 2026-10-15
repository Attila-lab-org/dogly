/**
 * API giochi: submit punteggio (idempotente via client_request_id) e
 * classifica settimanale. Mock gate: i chiamanti disabilitano le chiamate.
 */
import { api } from '../../lib/apiClient';

export interface LeaderboardEntry {
  rank: number;
  dog_id: string;
  dog_name: string;
  score: number;
  avatar_url: string | null;
  is_mine: boolean;
}

export interface GameLeaderboard {
  game: string;
  week_start: string;
  items: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export function newGameRequestId(): string {
  return `crid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function submitGameScore(
  dogId: string,
  score: number,
): Promise<void> {
  await api.post('/v1/games/scores', {
    dog_id: dogId,
    game: 'squirrel',
    score,
    client_request_id: newGameRequestId(),
  });
}

export async function fetchGameLeaderboard(
  game = 'squirrel',
): Promise<GameLeaderboard> {
  return api.get<GameLeaderboard>(`/v1/games/leaderboard?game=${game}`);
}

import type { RealtimeSession } from './api';
let pending: { session: RealtimeSession; messages: unknown[] } | null = null;
export function rememberRealtimeSession<T>(session: RealtimeSession, messages: T[]): void {
  pending = { session, messages: [...messages] };
}
export function resumeRealtimeSession<T>(id: string, dogId: string): { session: RealtimeSession; messages: T[] } | null {
  if (!pending || pending.session.id !== id || pending.session.dog_id !== dogId || pending.session.status !== 'ACTIVE' || Date.parse(pending.session.expires_at) <= Date.now()) return null;
  const resumed = { session: pending.session, messages: [...pending.messages] as T[] };
  pending = null;
  return resumed;
}

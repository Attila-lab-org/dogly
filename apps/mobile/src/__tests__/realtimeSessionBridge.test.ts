import { rememberRealtimeSession, resumeRealtimeSession } from '../features/realtime/sessionBridge';
import type { RealtimeSession } from '../features/realtime/api';
const session = { id: 'chat-a', dog_id: 'dog-a', status: 'ACTIVE', expires_at: '2099-01-01T00:00:00Z' } as RealtimeSession;
test('preserves session and history across capture and retries', () => {
  const messages = [{ role: 'user', text: 'Lo fa quando torno a casa' }];
  rememberRealtimeSession(session, messages);
  expect(resumeRealtimeSession('chat-a', 'dog-a')).toEqual({ session, messages });
  expect(resumeRealtimeSession('chat-a', 'dog-a')).toBeNull();
});
test('rejects mismatched session or dog', () => {
  rememberRealtimeSession(session, []);
  expect(resumeRealtimeSession('chat-b', 'dog-a')).toBeNull();
  expect(resumeRealtimeSession('chat-a', 'dog-b')).toBeNull();
});
test('rejects expired and ended sessions', () => {
  rememberRealtimeSession({ ...session, expires_at: '2000-01-01T00:00:00Z' }, []);
  expect(resumeRealtimeSession('chat-a', 'dog-a')).toBeNull();
  rememberRealtimeSession({ ...session, status: 'ENDED' }, []);
  expect(resumeRealtimeSession('chat-a', 'dog-a')).toBeNull();
});

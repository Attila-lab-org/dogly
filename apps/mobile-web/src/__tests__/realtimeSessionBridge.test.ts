import { rememberRealtimeSession, resetRealtimeSessionBridgeForTests, resumeRealtimeSession, setRealtimeSessionStorageForTests } from '../features/realtime/sessionBridge';
import type { RealtimeSession } from '../features/realtime/api';

const session = { id: 'chat-a', dog_id: 'dog-a', status: 'ACTIVE', expires_at: '2099-01-01T00:00:00Z' } as RealtimeSession;
const storage = new Map<string, string>();
const storageBackend = {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.delete(key); },
};

beforeEach(() => {
  storage.clear();
  setRealtimeSessionStorageForTests(storageBackend);
});

afterAll(() => {
  setRealtimeSessionStorageForTests(null);
});

test('preserves session and history across capture and retries', async () => {
  const messages = [{ role: 'user', text: 'Lo fa quando torno a casa' }];
  await rememberRealtimeSession(session, messages);
  await expect(resumeRealtimeSession('chat-a', 'dog-a')).resolves.toEqual({ session, messages });
  await expect(resumeRealtimeSession('chat-a', 'dog-a')).resolves.toBeNull();
});

test('restores a compact handoff after the in-memory bridge is unavailable', async () => {
  const messages = [{ id: 'm1', role: 'user' as const, text: 'Una frase lunga'.repeat(100), turn: { sensitive: true } }];
  await rememberRealtimeSession(session, messages);
  resetRealtimeSessionBridgeForTests();
  const resumed = await resumeRealtimeSession<typeof messages[number]>('chat-a', 'dog-a');
  expect(resumed?.messages).toEqual([{ id: 'm1', role: 'user', text: 'Una frase lunga'.repeat(100).slice(0, 2000) }]);
  expect(storage.size).toBe(0);
});

test('rejects mismatched session or dog and clears the one-shot handoff', async () => {
  await rememberRealtimeSession(session, []);
  await expect(resumeRealtimeSession('chat-b', 'dog-a')).resolves.toBeNull();
  await expect(resumeRealtimeSession('chat-a', 'dog-a')).resolves.toBeNull();
  await rememberRealtimeSession(session, []);
  await expect(resumeRealtimeSession('chat-a', 'dog-b')).resolves.toBeNull();
});

test('rejects expired and ended sessions', async () => {
  await rememberRealtimeSession({ ...session, expires_at: '2000-01-01T00:00:00Z' }, []);
  await expect(resumeRealtimeSession('chat-a', 'dog-a')).resolves.toBeNull();
  await rememberRealtimeSession({ ...session, status: 'ENDED' }, []);
  await expect(resumeRealtimeSession('chat-a', 'dog-a')).resolves.toBeNull();
});

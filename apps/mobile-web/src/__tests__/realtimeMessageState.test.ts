import { removeFailedRetryPair } from '../features/realtime/messageState';

test('retry replaces the failed turn without duplicating the user message', () => {
  const messages = [
    { id: 'welcome' },
    { id: 'question-1' },
    { id: 'question-1-error', retryForId: 'question-1' },
  ];

  expect(removeFailedRetryPair(messages, 'question-1-error')).toEqual([
    { id: 'welcome' },
  ]);
});

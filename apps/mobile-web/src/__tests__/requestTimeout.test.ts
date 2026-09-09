import { createRequestTimeout } from '../lib/requestTimeout';

describe('request timeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('interrompe una richiesta appesa alla scadenza', () => {
    const timeout = createRequestTimeout(15_000);

    expect(timeout.controller.signal.aborted).toBe(false);
    jest.advanceTimersByTime(15_000);
    expect(timeout.controller.signal.aborted).toBe(true);
  });

  it('non interrompe una richiesta completata', () => {
    const timeout = createRequestTimeout(15_000);

    timeout.clear();
    jest.advanceTimersByTime(15_000);
    expect(timeout.controller.signal.aborted).toBe(false);
  });
});

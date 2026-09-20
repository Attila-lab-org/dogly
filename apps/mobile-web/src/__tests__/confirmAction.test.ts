jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'web' },
}));

import { confirmDestructiveAction, confirmPublicProfile } from '../lib/confirmAction';

describe('browser destructive confirmation', () => {
  it('runs the action only after browser confirmation', () => {
    const confirm = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    Object.defineProperty(globalThis, 'confirm', {
      configurable: true,
      value: confirm,
    });
    const action = jest.fn();

    confirmDestructiveAction('Eliminare?', 'Operazione definitiva.', action);
    expect(action).not.toHaveBeenCalled();

    confirmDestructiveAction('Eliminare?', 'Operazione definitiva.', action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

it('uses browser confirmation for public profile consent', () => {
  const confirm = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  Object.defineProperty(globalThis, 'confirm', {
    configurable: true,
    value: confirm,
  });
  const action = jest.fn();
  confirmPublicProfile(action);
  expect(action).not.toHaveBeenCalled();
  confirmPublicProfile(action);
  expect(action).toHaveBeenCalledTimes(1);
});

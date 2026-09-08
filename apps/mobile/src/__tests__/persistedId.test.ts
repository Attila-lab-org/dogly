import { isPersistedId } from '../lib/persistedId';

describe('isPersistedId', () => {
  it('accetta solo UUID veri, non gli id del mock gate', () => {
    expect(isPersistedId('dog-rocky')).toBe(false);
    expect(isPersistedId('evt-relax')).toBe(false);
    expect(isPersistedId('')).toBe(false);
    expect(
      isPersistedId('eae66e03-8fdd-4d11-89ff-52b013b4db18'),
    ).toBe(true);
  });
});

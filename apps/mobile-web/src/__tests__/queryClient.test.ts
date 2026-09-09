import { clearProtectedCache, queryClient, queryKeys } from '../lib/queryClient';

describe('queryClient / query keys (sez. 5.3)', () => {
  it('le chiavi sono scoped per user e dog', () => {
    expect(queryKeys.behaviorEvent('u1', 'd1', 'e1')).toEqual([
      'user',
      'u1',
      'dog',
      'd1',
      'behavior-events',
      'e1',
    ]);
    expect(queryKeys.diary('u1', 'd1')).toEqual(['user', 'u1', 'dog', 'd1', 'diary']);
    expect(queryKeys.subscription('u1')).toEqual(['user', 'u1', 'subscription']);
  });

  it('cani diversi → chiavi diverse', () => {
    expect(queryKeys.patterns('u1', 'd1')).not.toEqual(queryKeys.patterns('u1', 'd2'));
  });

  it('logout: clearProtectedCache svuota la cache protetta', () => {
    const key = queryKeys.dogs('u-logout');
    queryClient.setQueryData(key, [{ id: 'd1' }]);
    expect(queryClient.getQueryData(key)).toBeDefined();
    clearProtectedCache(queryClient);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });
});

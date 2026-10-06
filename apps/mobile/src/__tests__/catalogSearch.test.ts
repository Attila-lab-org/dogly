import { scheduleCatalogSearch } from '../features/nutrition/catalogSearch';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('new input cancels old timer', async () => {
 const load = jest.fn().mockResolvedValue(['Purina']); const success = jest.fn();
 const cancel = scheduleCatalogSearch(load, success, jest.fn(), jest.fn());
 jest.advanceTimersByTime(200); cancel();
 scheduleCatalogSearch(load, success, jest.fn(), jest.fn());
 jest.advanceTimersByTime(500); await flush();
 expect(load).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledWith(['Purina']);
});
test('late old response cannot clear current results', async () => {
 let resolveOld!: (value: string[]) => void;
 const success = jest.fn(); const done = jest.fn();
 const cancel = scheduleCatalogSearch(() => new Promise<string[]>(r => { resolveOld = r; }), success, jest.fn(), done);
 jest.advanceTimersByTime(500); cancel();
 scheduleCatalogSearch(() => Promise.resolve(['Purina']), success, jest.fn(), done);
 jest.advanceTimersByTime(500); await flush(); resolveOld([]); await flush();
 expect(success).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledWith(['Purina']); expect(done).toHaveBeenCalledTimes(1);
});
test('network failure differs from empty catalog', async () => {
 const success = jest.fn(); const failure = jest.fn();
 scheduleCatalogSearch(() => Promise.reject(new Error('offline')), success, failure, jest.fn());
 jest.advanceTimersByTime(500); await flush();
 expect(success).not.toHaveBeenCalled(); expect(failure).toHaveBeenCalledTimes(1);
});

import {
  dismissWelcomeCheckIn,
  getCheckInSnapshot,
  markCheckInNeedsCare,
  markCheckInSoftOk,
} from '../features/checkin/store';

describe('welcome check-in', () => {
  it('closes softly when the dog seems serene', () => {
    markCheckInSoftOk();
    const snap = getCheckInSnapshot();
    expect(snap.welcomePending).toBe(false);
    expect(snap.analysisContext?.concern).toBe('soft');
  });

  it('keeps care context for personalized analysis', () => {
    markCheckInNeedsCare('Rocky');
    expect(getCheckInSnapshot().analysisContext?.concern).toBe('off');
    expect(getCheckInSnapshot().analysisContext?.note).toContain('Rocky');
    dismissWelcomeCheckIn();
    expect(getCheckInSnapshot().welcomePending).toBe(false);
  });
});

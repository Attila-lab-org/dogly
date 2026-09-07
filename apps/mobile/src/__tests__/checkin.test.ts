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
    markCheckInNeedsCare('Rocky', 'dog-1');
    expect(getCheckInSnapshot().analysisContext?.concern).toBe('off');
    expect(getCheckInSnapshot().analysisContext?.note).toContain('Rocky');
    expect(getCheckInSnapshot().analysisContext?.dogId).toBe('dog-1');
    dismissWelcomeCheckIn();
    expect(getCheckInSnapshot().welcomePending).toBe(false);
  });
});

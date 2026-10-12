import { prepareHomeMessage, readHomeMessage, takeHomeMessage } from '../features/realtime/homeMessage';
import { digestiveSummaryLabel, foodSummary, routineSummary } from '../features/dogs/profileSummary';

describe('Home conversation handoff', () => {
  it('keeps the draft scoped to owner and dog and consumes it once', () => {
    const id = prepareHomeMessage('owner-a', 'dog-a', 'Oggi è più agitato');
    expect(id).toBeTruthy();
    expect(readHomeMessage(id, 'owner-b', 'dog-a')).toBeNull();
    expect(readHomeMessage(id, 'owner-a', 'dog-b')).toBeNull();
    expect(takeHomeMessage(id, 'owner-a', 'dog-a')).toBe('Oggi è più agitato');
    expect(takeHomeMessage(id, 'owner-a', 'dog-a')).toBeNull();
  });
  it('rejects empty or oversized drafts', () => {
    expect(prepareHomeMessage('owner-a', 'dog-a', '  ')).toBeNull();
    expect(prepareHomeMessage('owner-a', 'dog-a', 'x'.repeat(4001))).toBeNull();
  });
});

describe('profile summaries', () => {
  it('does not duplicate brand, and preserves the quantity', () => {
    expect(foodSummary({ brand: 'Markies', name: 'Markies Original' }, '500 g al giorno')).toBe('Markies Original · 500 g al giorno');
    expect(foodSummary({ brand: 'Acme', name: 'Sensitive' }, null)).toBe('Acme Sensitive');
  });
  it('keeps unknown states honest', () => {
    expect(routineSummary(null)).toBe('Raccontami le sue abitudini');
    expect(digestiveSummaryLabel(undefined)).toBe('Digestione · Ancora da osservare');
    expect(digestiveSummaryLabel(undefined, false, true)).toContain('Non riesco');
  });
});

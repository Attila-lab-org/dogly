// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resultScreen = readFileSync(
  resolve(__dirname, '../../app/digestive/result/[eventId].tsx'),
  'utf8',
);

describe('digestive result UX', () => {
  it('routes legacy result URLs into Ask chat-first', () => {
    expect(resultScreen).toContain("pathname: '/ask'");
    expect(resultScreen).toContain("source: 'digestive'");
    expect(resultScreen).toContain("intent: 'revisit'");
    expect(resultScreen).not.toContain('consumerHeadline');
    expect(resultScreen).not.toContain('postDigestiveFeedback');
  });
});

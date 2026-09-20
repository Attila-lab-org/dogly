// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../features/realtime/useDoglyRealtime.ts'),
  'utf8',
);

describe('realtime voice turn safety', () => {
  it('starts every spoken turn with a clean assistant transcript', () => {
    expect(source).toContain('assistantTranscriptSourceRef');
    expect(source).toContain("assistantRef.current = ''");
    expect(source).toContain('setAssistantDraft(\'\')');
  });

  it('ignores duplicate terminal events and waits for the real response end', () => {
    expect(source).toContain("type ResponsePhase = 'idle' | 'generating' | 'draining' | 'cooldown'");
    expect(source).toContain("responsePhaseRef.current !== 'generating'");
    expect(source).toContain("case 'output_audio_buffer.stopped':");
    expect(source).toContain('pendingTextQueueRef');
    expect(source).not.toContain("type: 'response.cancel'");
    expect(source).not.toContain("case 'response.output_audio.done':");
    expect(source).not.toContain("case 'response.audio.done':");
  });
});

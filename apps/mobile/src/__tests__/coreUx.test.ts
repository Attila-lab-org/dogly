/**
 * Test mirati del workstream F1 (UX core):
 * - macchina di cattura (sez. 6/13): ready → recording → too short /
 *   hard cap 20 s / permission denied;
 * - invarianti del result contract (sez. 6.1) sui mock: band mai %,
 *   wording probabilistico, 3–5 evidence, alternative 0–2;
 * - timeline Diario: riferimenti coerenti e ordinamento.
 */
import {
  CAPTURE_MAX_SECONDS,
  CAPTURE_MIN_SECONDS,
  captureReducer,
  formatCaptureTimer,
  initialCaptureState,
  type CaptureState,
} from '../features/core/captureMachine';
import {
  CONFIDENCE_BAND_LABELS,
  PROCESSING_STEPS,
  intentHeadline,
} from '../features/core/copy';
import { saveBehaviorFeedback } from '../features/core/feedback';
import { BEHAVIOR_EVENT_STATUSES } from '../contracts/types';
import { behaviorResultsMock, diaryEntriesMock, homeDataMock } from '../mocks/core';

describe('captureMachine (sez. 13)', () => {
  const ready: CaptureState = captureReducer(initialCaptureState, {
    type: 'PERMISSION_GRANTED',
    micGranted: true,
  });

  it('parte in permission_denied finché il permesso non arriva', () => {
    expect(initialCaptureState.phase).toBe('permission_denied');
    expect(
      captureReducer(initialCaptureState, { type: 'PERMISSION_DENIED' }).phase,
    ).toBe('permission_denied');
  });

  it('permesso concesso → ready; mic negato → audioDegraded ma non bloccante', () => {
    expect(ready.phase).toBe('ready');
    const noMic = captureReducer(initialCaptureState, {
      type: 'PERMISSION_GRANTED',
      micGranted: false,
    });
    expect(noMic.phase).toBe('ready');
    expect(noMic.audioDegraded).toBe(true);
  });

  it('stop sotto il minimo utile → too_short (niente upload)', () => {
    let s = captureReducer(ready, { type: 'START' });
    for (let i = 0; i < CAPTURE_MIN_SECONDS - 1; i += 1) {
      s = captureReducer(s, { type: 'TICK' });
    }
    expect(s.phase).toBe('recording');
    s = captureReducer(s, { type: 'STOP' });
    expect(s.phase).toBe('too_short');
  });

  it('stop dopo il minimo → completed', () => {
    let s = captureReducer(ready, { type: 'START' });
    for (let i = 0; i < CAPTURE_MIN_SECONDS; i += 1) {
      s = captureReducer(s, { type: 'TICK' });
    }
    s = captureReducer(s, { type: 'STOP' });
    expect(s.phase).toBe('completed');
  });

  it('hard cap 20 s: stop automatico, mai oltre', () => {
    let s = captureReducer(ready, { type: 'START' });
    for (let i = 0; i < CAPTURE_MAX_SECONDS + 3; i += 1) {
      s = captureReducer(s, { type: 'TICK' });
    }
    expect(s.phase).toBe('completed');
    expect(s.elapsedSeconds).toBe(CAPTURE_MAX_SECONDS);
  });

  it('too_short può ripartire direttamente con START', () => {
    let s = captureReducer(ready, { type: 'START' });
    s = captureReducer(s, { type: 'STOP' });
    expect(s.phase).toBe('too_short');
    s = captureReducer(s, { type: 'START' });
    expect(s.phase).toBe('recording');
    expect(s.elapsedSeconds).toBe(0);
  });

  it('formatCaptureTimer formatta mm:ss', () => {
    expect(formatCaptureTimer(0)).toBe('0:00');
    expect(formatCaptureTimer(7)).toBe('0:07');
    expect(formatCaptureTimer(20)).toBe('0:20');
  });
});

describe('result contract sui mock (sez. 6.1)', () => {
  const completed = Object.values(behaviorResultsMock).filter(
    (r) => r.status === 'COMPLETED',
  );

  it('ogni risultato completato ha 3–5 evidence e 0–2 alternative', () => {
    for (const r of completed) {
      expect(r.evidence.length).toBeGreaterThanOrEqual(3);
      expect(r.evidence.length).toBeLessThanOrEqual(5);
      expect(r.alternatives.length).toBeLessThanOrEqual(2);
    }
  });

  it('confidence solo a band, mai percentuali in nessun copy', () => {
    for (const r of Object.values(behaviorResultsMock)) {
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(r.confidence_band);
      expect(r.consumer_summary).not.toMatch(/\d+\s?%/);
    }
    for (const label of Object.values(CONFIDENCE_BAND_LABELS)) {
      expect(label).not.toMatch(/\d+\s?%/);
    }
  });

  it('wording dei summary sempre probabilistico (sembra/probabilmente/possibile)', () => {
    for (const r of completed) {
      expect(r.consumer_summary).toMatch(/sembra|probabilmente|possibile|potrebbe/i);
    }
  });

  it('INSUFFICIENT è un risultato completato valido con primary_intent null', () => {
    const insufficient = behaviorResultsMock['evt-insufficient'];
    expect(insufficient.status).toBe('COMPLETED');
    expect(insufficient.primary_intent).toBeNull();
  });

  it('headline ricalibrata sul cane, iniziale minuscola, mai % ', () => {
    expect(intentHeadline('Rocky', 'PLAY_INTERACTION')).toBe(
      'Rocky sembra voler giocare',
    );
    expect(intentHeadline('Rocky', null)).toBe('Non riesco ancora a capire Rocky');
  });

  it('gli step di processing usano solo stati canonici (sez. 33.1)', () => {
    for (const step of PROCESSING_STEPS) {
      expect(BEHAVIOR_EVENT_STATUSES).toContain(step.status);
    }
  });
});

describe('mock Home e Diario', () => {
  it('mantiene il Knowledge Score nel dominio profilo e l’ultima analisi Home', () => {
    expect(homeDataMock.knowledgeScore.score).toBe(38);
    expect(homeDataMock.lastInsight?.label).toBe('sembra rilassato');
    expect(homeDataMock.usage.behaviorUsed).toBeLessThanOrEqual(
      homeDataMock.usage.behaviorLimit,
    );
  });

  it('timeline ordinata discendente con riferimenti behavior validi', () => {
    const times = diaryEntriesMock.map((e) => Date.parse(e.occurredAt));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
    for (const e of diaryEntriesMock) {
      if (e.domain === 'BEHAVIOR') {
        expect(behaviorResultsMock[e.refId]).toBeDefined();
      }
    }
    // copertura stato "deleted media" (sez. 6)
    expect(diaryEntriesMock.some((e) => e.mediaDeleted)).toBe(true);
    // timeline mista behavior + digestivo (sez. 6)
    expect(new Set(diaryEntriesMock.map((e) => e.domain))).toEqual(
      new Set(['BEHAVIOR', 'DIGESTIVE']),
    );
  });

  it('salva il feedback con un solo tap e lo mantiene nel Diario', async () => {
    const result = behaviorResultsMock['evt-play'];
    const entry = diaryEntriesMock.find((item) => item.refId === result.eventId);
    const previousFeedback = result.feedback;
    const previousSubtitle = entry?.subtitle ?? null;

    await expect(saveBehaviorFeedback(result.eventId, 'NO')).resolves.toBe('NO');
    expect(result.feedback).toBe('NO');
    expect(entry?.subtitle).toContain('Feedback: non credo');

    result.feedback = previousFeedback;
    if (entry) entry.subtitle = previousSubtitle;
  });
});

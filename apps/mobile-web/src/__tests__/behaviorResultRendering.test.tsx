// The actual shared result view is rendered; native visuals are simple host elements.
// @ts-nocheck
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('react-native', () => {
  const React = require('react');
  const host = (tag) => ({ children, testID, accessibilityState }) =>
    React.createElement(tag, {
      'data-testid': testID,
      'aria-expanded': accessibilityState?.expanded,
    }, children);
  return {
    View: host('div'), Text: host('span'), Pressable: host('button'),
    Image: () => null, StyleSheet: { create: (styles) => styles },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../components/CuteIcon', () => ({ CuteIcon: () => null }));
jest.mock('../components', () => {
  const React = require('react');
  return {
    Card: ({ children }) => React.createElement('div', null, children),
    SectionHeader: ({ title }) => React.createElement('span', null, title),
    ProgressBar: () => null,
  };
});
jest.mock('../../assets/images/puppy-play.png', () => 'puppy');
import { BehaviorResultView } from '../features/core/components';

const base = {
  eventId: 'event-1', dogId: 'dog-1', status: 'COMPLETED',
  primary_intent: 'PLAY_INTERACTION', confidence_band: 'MEDIUM',
  consumer_headline: 'Oreo sembra volerti coinvolgere nel gioco.',
  dog_voice: '«Dai, giochiamo.»',
  consumer_summary: 'Torna verso di te con il corpo sciolto.',
  evidence: [{ source: 'OBSERVATION', label: 'Si avvicina con il corpo sciolto.' }],
  alternatives: [], feedback: null, needs_context: false,
};
function render(result = {}, props = {}) {
  return renderToStaticMarkup(React.createElement(BehaviorResultView, {
    result: { ...base, ...result }, dogName: 'Oreo', feedback: null,
    onFeedback: () => {}, ...props,
  }));
}
afterEach(() => jest.restoreAllMocks());

it('shows meaning and the hypothetical translation immediately, with the explanation closed', () => {
  const html = render();
  expect(html).toContain(base.consumer_headline);
  expect(html).toContain('In parole umane');
  expect(html).toContain(base.dog_voice);
  expect(html).toContain('Una possibile lettura del momento');
  expect(html).toContain('Perché?');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain(base.consumer_summary);
  expect(html).not.toContain(base.evidence[0].label);
  expect(html).not.toContain('Cosa fare ora');
  expect(html.indexOf(base.consumer_headline)).toBeLessThan(html.indexOf('In parole umane'));
  expect(html.indexOf('In parole umane')).toBeLessThan(html.indexOf('Perché?'));
});

it.each([null, 'INSUFFICIENT', 'AMBIGUOUS'])('does not speak for the dog when intent is %s', (intent) => {
  const html = render({ primary_intent: intent });
  expect(html).not.toContain(base.dog_voice);
  expect(html).not.toContain('In parole umane');
});

it('does not invent a translation when the API supplies none', () => {
  expect(render({ dog_voice: null })).not.toContain('In parole umane');
});

it('puts an available action before the explanation and the useful question last', () => {
  const html = render({ recommended_next_step: 'Fai una breve pausa.' }, {
    contextPrompt: React.createElement('span', null, 'Succede anche al cancello?'),
  });
  expect(html.indexOf('In parole umane')).toBeLessThan(html.indexOf('Fai una breve pausa.'));
  expect(html.indexOf('Fai una breve pausa.')).toBeLessThan(html.indexOf('Perché?'));
  expect(html.indexOf('Perché?')).toBeLessThan(html.indexOf('Succede anche al cancello?'));
});

it('keeps safety visible and suppresses duplicate advice and playful translation', () => {
  const html = render({
    safety: { title: 'Serve spazio', message: 'Il corpo è teso.', action: 'Aumenta la distanza.' },
    recommended_next_step: 'Consiglio duplicato',
  }, { primaryAdvice: React.createElement('span', null, 'Altro consiglio') });
  expect(html).toContain('Aumenta la distanza.');
  expect(html).not.toContain('Consiglio duplicato');
  expect(html).not.toContain('Altro consiglio');
  expect(html).not.toContain(base.dog_voice);
});

it('surfaces a familiar moment only with confirmed memory', () => {
  const note = 'Per Oreo, questo somiglia a momenti che hai già confermato.';
  const result = { baseline_comparison: 'RECOGNIZED', baseline_note: note };
  expect(render(result)).not.toContain(note);
  expect(render({ ...result, personalMemory: [{
    pattern_id: 'p1', state: 'PRELIMINARY', support_summary: 'Un episodio dopo il gioco.',
  }] })).not.toContain(note);
  expect(render({ ...result, personalMemory: [{
    pattern_id: 'p1', state: 'ESTABLISHED', support_summary: 'Confermato dopo il gioco.',
  }] })).toContain(note);
});

it('the expanded explanation retains video, audio, owner context and personal memory', () => {
  // Open the disclosure state; all content and source grouping are rendered by the real view.
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [true, jest.fn()]);
  const html = render({
    sound_note: 'Si sente un abbaio breve.',
    evidence: [...base.evidence, { source: 'CONTEXT', label: 'Avevi appena preso la palla.' }],
    personalMemory: [{ pattern_id: 'p1', state: 'ESTABLISHED', support_summary: 'Altri inviti al gioco confermati.' }],
  }, { adviceRationale: 'Le pause gli lasciano una scelta.' });
  expect(html).toContain('aria-expanded="true"');
  for (const text of [base.consumer_summary, base.evidence[0].label,
    'Si sente un abbaio breve.', 'Avevi appena preso la palla.',
    'Altri inviti al gioco confermati.', 'Le pause gli lasciano una scelta.']) {
    expect(html).toContain(text);
  }
  expect(html.match(/In parole umane/g)).toHaveLength(1);
});

import {
  currentQuestionId,
  initialProcessingCardState,
  reduceProcessingCard,
  type ProcessingCardState,
} from '../features/behavior/processingContextMachine';
import type { ProcessingContextOut } from '../features/behavior/api';

const q1 = {
  id: 'before_moment',
  text: 'Cosa stava succedendo subito prima?',
  options: [
    { id: 'nothing_special', label: 'Niente di particolare' },
    { id: 'not_sure', label: 'Non lo so' },
  ],
};
const q2 = {
  id: 'usual_situation',
  text: 'Per Rocky era una situazione normale?',
  options: [
    { id: 'usual', label: 'Sì, abituale' },
    { id: 'unusual', label: 'No, insolita' },
  ],
};

function payload(
  overrides: Partial<ProcessingContextOut> = {},
): ProcessingContextOut {
  return {
    event_id: 'evt-1',
    analysis_status: 'OBSERVING',
    question: q1,
    answered_count: 0,
    max_questions: 3,
    planner_version: 'processing-planner/v1',
    accepting_answers: true,
    accepted_answers: [],
    ...overrides,
  };
}

function play(
  events: Parameters<typeof reduceProcessingCard>[1][],
  start: ProcessingCardState = initialProcessingCardState(),
): ProcessingCardState {
  return events.reduce(reduceProcessingCard, start);
}

describe('processing context card machine', () => {
  it('does not show ACK before the server answers', () => {
    const state = play([
      { type: 'POLL', payload: payload() },
      { type: 'SELECT', optionId: 'nothing_special' },
      { type: 'MUTATION_START' },
    ]);
    expect(state.answerState).toBe('sending');
    expect(state.locked?.id).toBe('before_moment');
    expect(state.acceptedAnswers).toEqual([]);
  });

  it('shows acquired then advances to question 2 after ACK', () => {
    let state = play([
      { type: 'POLL', payload: payload() },
      { type: 'SELECT', optionId: 'nothing_special' },
      { type: 'MUTATION_START' },
      {
        type: 'MUTATION_SUCCESS',
        payload: payload({
          question: q2,
          answered_count: 1,
          applied_to_interpretation: true,
          accepted_answers: [
            {
              question_id: 'before_moment',
              answer_id: 'nothing_special',
              title: 'Prima',
              label: 'Niente di particolare',
            },
          ],
        }),
        selectedLabel: 'Niente di particolare',
      },
    ]);
    expect(state.answerState).toBe('acquired');
    expect(currentQuestionId(state)).toBe('before_moment');
    expect(state.acceptedAnswers[0]).toMatchObject({
      title: 'Prima',
      label: 'Niente di particolare',
    });
    state = reduceProcessingCard(state, { type: 'ACK_DONE' });
    expect(state.answerState).toBe('idle');
    expect(currentQuestionId(state)).toBe('usual_situation');
  });

  it('never restores question 1 after a stale poll', () => {
    let state = play([
      { type: 'POLL', payload: payload() },
      { type: 'SELECT', optionId: 'nothing_special' },
      { type: 'MUTATION_START' },
      {
        type: 'MUTATION_SUCCESS',
        payload: payload({
          question: q2,
          answered_count: 1,
          applied_to_interpretation: true,
          accepted_answers: [
            {
              question_id: 'before_moment',
              answer_id: 'nothing_special',
              title: 'Prima',
              label: 'Niente di particolare',
            },
          ],
        }),
      },
      { type: 'ACK_DONE' },
      { type: 'SELECT', optionId: 'usual' },
      { type: 'MUTATION_START' },
      {
        type: 'MUTATION_SUCCESS',
        payload: payload({
          question: null,
          answered_count: 2,
          applied_to_interpretation: true,
          accepted_answers: [
            {
              question_id: 'before_moment',
              answer_id: 'nothing_special',
              title: 'Prima',
              label: 'Niente di particolare',
            },
            {
              question_id: 'usual_situation',
              answer_id: 'usual',
              title: 'Situazione',
              label: 'Sì, abituale',
            },
          ],
        }),
      },
    ]);
    expect(state.answerState).toBe('acquired');
    state = reduceProcessingCard(state, {
      type: 'POLL',
      payload: payload({ question: q1, answered_count: 0 }),
      generation: 0,
    });
    expect(currentQuestionId(state)).not.toBe('before_moment');
    state = reduceProcessingCard(state, { type: 'ACK_DONE' });
    state = reduceProcessingCard(state, {
      type: 'POLL',
      payload: payload({ question: q1, accepting_answers: true }),
      generation: 0,
    });
    expect(currentQuestionId(state)).not.toBe('before_moment');
    expect(state.answeredQuestionIds).toEqual(
      expect.arrayContaining(['before_moment', 'usual_situation']),
    );
  });

  it('marks a late answer without presenting it as acquired', () => {
    const state = play([
      { type: 'POLL', payload: payload() },
      { type: 'SELECT', optionId: 'nothing_special' },
      { type: 'MUTATION_START' },
      {
        type: 'MUTATION_SUCCESS',
        payload: payload({
          question: null,
          accepting_answers: false,
          applied_to_interpretation: false,
        }),
      },
    ]);
    expect(state.answerState).toBe('too_late');
  });
});

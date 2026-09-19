import type {
  ProcessingContextOut,
  ProcessingContextQuestion,
} from './api';

export const PROCESSING_ACK_MS = 500;

export type AnswerUiState = 'idle' | 'sending' | 'acquired' | 'too_late';

export type AcceptedAnswer = {
  questionId: string;
  answerId: string;
  title: string;
  label: string;
};

export type ProcessingCardState = {
  locked: ProcessingContextQuestion | null;
  selectedId: string | null;
  skipped: boolean;
  answerState: AnswerUiState;
  acceptedAnswers: AcceptedAnswer[];
  answeredQuestionIds: string[];
  pendingNext: ProcessingContextQuestion | null;
  acceptingAnswers: boolean;
  error: string | null;
  mutationGeneration: number;
};

export type ProcessingCardEvent =
  | { type: 'POLL'; payload: ProcessingContextOut; generation?: number }
  | { type: 'SELECT'; optionId: string }
  | { type: 'SKIP' }
  | { type: 'MUTATION_START' }
  | {
      type: 'MUTATION_SUCCESS';
      payload: ProcessingContextOut;
      selectedLabel?: string;
    }
  | { type: 'MUTATION_ERROR' }
  | { type: 'ACK_DONE' };

export function initialProcessingCardState(): ProcessingCardState {
  return {
    locked: null,
    selectedId: null,
    skipped: false,
    answerState: 'idle',
    acceptedAnswers: [],
    answeredQuestionIds: [],
    pendingNext: null,
    acceptingAnswers: true,
    error: null,
    mutationGeneration: 0,
  };
}

function mergeAccepted(
  current: AcceptedAnswer[],
  incoming: AcceptedAnswer[],
): AcceptedAnswer[] {
  const byId = new Map<string, AcceptedAnswer>();
  for (const item of [...current, ...incoming]) {
    byId.set(item.questionId, item);
  }
  return [...byId.values()];
}

export function acceptedFromPayload(
  payload: ProcessingContextOut,
): AcceptedAnswer[] {
  return (payload.accepted_answers ?? []).map((item) => ({
    questionId: item.question_id,
    answerId: item.answer_id,
    title: item.title,
    label: item.label,
  }));
}

function canLockQuestion(
  state: ProcessingCardState,
  question: ProcessingContextQuestion | null | undefined,
): boolean {
  if (!question) return false;
  if (state.answeredQuestionIds.includes(question.id)) return false;
  return true;
}

export function reduceProcessingCard(
  state: ProcessingCardState,
  event: ProcessingCardEvent,
): ProcessingCardState {
  switch (event.type) {
    case 'POLL': {
      if (state.answerState !== 'idle') return state;
      if (
        event.generation != null &&
        event.generation < state.mutationGeneration
      ) {
        return state;
      }
      const accepted = mergeAccepted(
        state.acceptedAnswers,
        acceptedFromPayload(event.payload),
      );
      const accepting = event.payload.accepting_answers !== false;
      let locked = state.locked;
      if (!locked && accepting) {
        const next = event.payload.question;
        if (canLockQuestion(state, next)) {
          locked = next ?? null;
        }
      }
      if (
        locked &&
        state.answeredQuestionIds.includes(locked.id)
      ) {
        locked = null;
      }
      return {
        ...state,
        acceptedAnswers: accepted,
        acceptingAnswers: accepting,
        locked,
      };
    }
    case 'SELECT':
      if (state.answerState !== 'idle') return state;
      return { ...state, selectedId: event.optionId, skipped: false, error: null };
    case 'SKIP':
      if (state.answerState !== 'idle') return state;
      return { ...state, selectedId: null, skipped: true, error: null };
    case 'MUTATION_START':
      return { ...state, answerState: 'sending', error: null };
    case 'MUTATION_SUCCESS': {
      const accepted = mergeAccepted(
        state.acceptedAnswers,
        acceptedFromPayload(event.payload),
      );
      const currentId = state.locked?.id;
      const answeredIds = currentId
        ? [...new Set([...state.answeredQuestionIds, currentId])]
        : state.answeredQuestionIds;
      if (
        currentId &&
        !state.skipped &&
        event.selectedLabel &&
        !accepted.some((item) => item.questionId === currentId)
      ) {
        accepted.push({
          questionId: currentId,
          answerId: state.selectedId ?? '',
          title: 'Contesto',
          label: event.selectedLabel,
        });
      }
      const nextQuestion = event.payload.question;
      const pendingNext =
        event.payload.accepting_answers !== false &&
        nextQuestion &&
        !answeredIds.includes(nextQuestion.id)
          ? nextQuestion
          : null;
      const applied = event.payload.applied_to_interpretation !== false;
      return {
        ...state,
        acceptedAnswers: accepted,
        answeredQuestionIds: answeredIds,
        pendingNext,
        acceptingAnswers: event.payload.accepting_answers !== false,
        answerState: applied ? 'acquired' : 'too_late',
        error: null,
        mutationGeneration: state.mutationGeneration + 1,
      };
    }
    case 'MUTATION_ERROR':
      return {
        ...state,
        answerState: 'idle',
        selectedId: null,
        skipped: false,
        error: 'Non sono riuscito a salvare la risposta. Riprova.',
      };
    case 'ACK_DONE': {
      if (state.answerState !== 'acquired' && state.answerState !== 'too_late') {
        return state;
      }
      return {
        ...state,
        locked: state.pendingNext,
        pendingNext: null,
        selectedId: null,
        skipped: false,
        answerState: 'idle',
      };
    }
    default:
      return state;
  }
}

export function currentQuestionId(state: ProcessingCardState): string | null {
  return state.locked?.id ?? null;
}

export function answeredCountCopy(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 risposta aggiunta';
  return `${count} risposte aggiunte`;
}

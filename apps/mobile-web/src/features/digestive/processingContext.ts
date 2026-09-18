export type DigestiveContextKey =
  | 'vomiting_today'
  | 'appetite_reduced'
  | 'unusual_food_48h';

export type DigestiveProcessingQuestion = {
  key: DigestiveContextKey;
  text: string;
};

export function digestiveProcessingQuestions(
  dogName: string,
): DigestiveProcessingQuestion[] {
  return [
    {
      key: 'vomiting_today',
      text: `${dogName} ha vomitato oggi?`,
    },
    {
      key: 'appetite_reduced',
      text: `${dogName} ha mangiato meno del solito oggi?`,
    },
    {
      key: 'unusual_food_48h',
      text: `${dogName} potrebbe aver mangiato qualcosa di insolito nelle ultime 48 ore?`,
    },
  ];
}

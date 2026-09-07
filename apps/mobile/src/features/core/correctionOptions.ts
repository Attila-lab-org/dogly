import {
  BEHAVIOR_INTENTS,
  type BehaviorIntent,
} from '../../contracts/types';

const PREFERRED: BehaviorIntent[] = [
  'PLAY_INTERACTION',
  'ATTENTION_REQUEST',
  'OUTSIDE_REQUEST',
  'RELAX_REST',
  'ALERT_VIGILANCE',
  'FEAR_INSECURITY',
  'RESOURCE_TENSION',
];

/**
 * 3–5 alternative pertinenti after "Non proprio", excluding the current
 * primary intent. Alternatives from the reasoner come first.
 */
export function correctionOptions(
  primary: BehaviorIntent | null,
  alternatives: Array<{ intent: BehaviorIntent }>,
  limit = 5,
): BehaviorIntent[] {
  const seen = new Set<BehaviorIntent>();
  const ordered: BehaviorIntent[] = [];
  const push = (intent: BehaviorIntent) => {
    if (intent === primary || intent === 'INSUFFICIENT' || intent === 'AMBIGUOUS') {
      return;
    }
    if (seen.has(intent)) return;
    seen.add(intent);
    ordered.push(intent);
  };
  for (const alt of alternatives) push(alt.intent);
  for (const intent of PREFERRED) push(intent);
  for (const intent of BEHAVIOR_INTENTS) push(intent);
  return ordered.slice(0, limit);
}

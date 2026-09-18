import type {
  ConfidenceBand,
  EvidenceItem,
} from '../../contracts/types';

export type ConsumerEvidenceSections = {
  observed: EvidenceItem[];
  ownerContext: EvidenceItem[];
  personalMemory: EvidenceItem[];
};

/**
 * Keep event observations, owner-provided context and personal history visibly
 * separate. Scientific provenance remains available to the backend/audit and
 * is never surfaced as a consumer claim.
 */
export function consumerEvidenceSections(
  evidence: EvidenceItem[],
): ConsumerEvidenceSections {
  return {
    observed: evidence.filter((item) => item.source === 'OBSERVATION'),
    ownerContext: evidence.filter((item) =>
      ['CONTEXT', 'LIFE_STAGE', 'LIFESTYLE_BASELINE'].includes(item.source),
    ),
    personalMemory: evidence.filter(
      (item) => item.source === 'PERSONAL_PATTERN',
    ),
  };
}

export function behaviorPrudenceCopy(
  band: ConfidenceBand | null | undefined,
): string {
  if (band === 'LOW') {
    return 'Il video non è del tutto chiaro: questa è una possibilità, non una conclusione.';
  }
  if (band === 'MEDIUM') {
    return 'I segnali sono abbastanza chiari, ma questa resta una lettura prudente.';
  }
  if (band === 'HIGH') {
    return 'I segnali nel video sono chiari, ma da un singolo momento non si può avere certezza.';
  }
  return 'Questa è una possibile lettura del momento, non una diagnosi.';
}

export function showPrimaryAdvice(args: {
  hasSafety: boolean;
  hasAdvice: boolean;
}): boolean {
  return args.hasAdvice && !args.hasSafety;
}

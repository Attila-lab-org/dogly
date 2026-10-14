const INTERNAL_CODE = /\b(?:SAFE|ADVICE|PRIOR|OBS|DIGEST)_[A-Z0-9_]+\b/gi;
const INTERNAL_ENUM =
  /\b(?:LOW|MEDIUM|HIGH|ROUTINE|MONITOR|ATTENTION|VET_CONTACT|INSUFFICIENT|ABOVE_USUAL|BELOW_USUAL|NEAR_USUAL)\b/g;
const QUALITY_CODE =
  /\b(?:filmed_screen|motion_blur|poor_lighting|too_dark|too_far|too_close|overexposed|dog_not_visible|image_quality|audio_degraded)\b/gi;

/** Leak detector for tests and last-line UI guards. No /g — lastIndex must stay stable. */
export const CONSUMER_LEAK_PATTERN =
  /\b(?:SAFE|ADVICE|PRIOR|OBS|DIGEST)_[A-Z0-9_]+\b|filmed_screen|motion_blur|poor_lighting|audio_degraded|fecal_score|confidence(?:\s+band)?(?:\s+(?:low|medium|high))?|quality\s+(?:high|medium|low)|score\s+\d+\s*\/\s*\d+|candidate\s+\w+|context bucket|play bow|\b(?:OpenAI|Gemini|LLM|RAG)\b/i;

const QUALITY_COPY: Record<string, string> = {
  filmed_screen:
    'Alcuni dettagli si perdono in questa ripresa. Se puoi, inquadra direttamente il soggetto invece dello schermo.',
  blurry: 'La foto è un po’ sfocata. Prova a tenerla più ferma.',
  motion_blur: 'La foto è mossa. Prova a tenerla più ferma.',
  too_dark: 'C’è poca luce. Prova in un punto più luminoso.',
  poor_lighting: 'La luce non mostra bene i dettagli. Prova in un punto più luminoso.',
  overexposed: 'La luce è troppo forte. Evita il flash diretto.',
  too_far: 'Avvicinati un po’, mantenendo tutta l’area visibile.',
  too_close: 'Allontanati leggermente per includere tutta l’area.',
  occluded: 'Una parte importante non è visibile. Prova da un’angolazione più libera.',
  dog_not_visible: 'Non riesco a vedere abbastanza bene il cane in questo video.',
  audio_degraded:
    'Il video mi permette di vedere il momento, ma non di sentirlo abbastanza. Posso dirti qualcosa sulla postura; per capire anche la vocalizzazione avrei bisogno di un audio più chiaro.',
};

/**
 * Ultima barriera consumer per risultati storici creati prima del Conversation
 * Layer. I dati tecnici restano nei contratti e nell’audit, non nella frase UI.
 */
export function consumerCopy(value: string | null | undefined): string {
  return (value ?? '')
    .replace(INTERNAL_CODE, '')
    .replace(/\b(?:support|confirm)=\d+\b/gi, '')
    .replace(QUALITY_CODE, '')
    .replace(INTERNAL_ENUM, '')
    .replace(/\bquality\s+(?:high|medium|low|insufficient)\b/gi, '')
    .replace(/\bscore\s+\d+\s*\/\s*\d+\b/gi, '')
    .replace(/\bfecal[_\s-]?score(?:\s+estimate)?\b/gi, '')
    .replace(/\bconfidence(?:\s+band)?(?:\s+(?:low|medium|high))?\b/gi, '')
    .replace(/\bconfidenza\s+(?:bassa|media|alta)\s*[;,.]?\s*/gi, '')
    .replace(/\bcandidate(?:\s+\w+)?\b/gi, '')
    .replace(/\bplay bow\b/gi, 'inchino di gioco')
    .replace(/\barousal\b/gi, 'attivazione')
    .replace(/\bcontext bucket\b/gi, 'contesto')
    .replace(/\bbaseline\b/gi, 'andamento abituale')
    .replace(/\b(?:OpenAI|Gemini|LLM|RAG)\b/gi, '')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Digestive owner cards: plain Italian, short, no clinical jargon. */
export function simplifyDigestiveOwnerCopy(
  value: string | null | undefined,
  options?: { maxChars?: number; maxSentences?: number },
): string {
  const maxChars = options?.maxChars ?? 220;
  const maxSentences = options?.maxSentences ?? 2;
  let text = consumerCopy(value)
    .replace(/\bsalsicciotto\b(?:\s*\([^)]*\))?/gi, 'ben formate')
    .replace(/\(~?\s*[1-7]\s*\)/g, '')
    .replace(/\bbristol\b[^.,;]*/gi, '')
    .replace(/\bdel\s+tratto\s+finale\s*\(retto\s*\/\s*ano\)/gi, 'della parte finale')
    .replace(/\btratto\s+finale\s*\(retto\s*\/\s*ano\)/gi, 'parte finale')
    .replace(/\bretto\s*\/\s*ano\b/gi, 'parte finale')
    .replace(/\bdel\s+retto\b/gi, 'della parte finale')
    .replace(/\bretto\b/gi, 'parte finale')
    .replace(/\bdell['’]?ano\b/gi, 'dell’uscita')
    .replace(/\bano\b/gi, 'uscita')
    .replace(/\bmicrofessur[ae]\b/gi, 'piccola irritazione')
    .replace(/\bvolume nella norma\b/gi, 'quantità normale')
    .replace(/\bquadro regolare\b/gi, 'quadro normale')
    .replace(/\btratto finale\b/gi, 'parte finale')
    .replace(/\bstriature rosso vivo\b/gi, 'tracce di sangue rosso')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
    .replace(/^[;,\s]+|[;,\s]+$/g, '');

  if (!text) return text;
  const parts = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const kept: string[] = [];
  let total = 0;
  for (const part of parts) {
    const next = total + part.length + (kept.length ? 1 : 0);
    if (kept.length && (kept.length >= maxSentences || next > maxChars)) break;
    kept.push(part);
    total = next;
    if (kept.length >= maxSentences) break;
  }
  text = kept.length ? kept.join(' ') : text;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 1).replace(/\s+\S*$/, '').replace(/[,;:]+$/, '')}…`;
  }
  return text;
}

export function mediaQualityCopy(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (QUALITY_COPY[normalized]) return QUALITY_COPY[normalized];
  const looksLikeCode = /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(trimmed.toLowerCase());
  const cleaned = consumerCopy(trimmed);
  if (looksLikeCode || !cleaned || leaksInternalConsumerCopy(cleaned)) {
    return 'La foto non mostra abbastanza bene i dettagli. Prova con più luce e una ripresa più nitida.';
  }
  return cleaned;
}

export function usefulQuestionKicker(ownerDisplayName?: string | null): string {
  const name = ownerDisplayName?.trim();
  return name ? `${name}, una cosa può aiutarmi` : 'Una cosa può aiutarmi';
}

export function processingQuestionKicker(ownerDisplayName?: string | null): string {
  const name = ownerDisplayName?.trim();
  return name
    ? `${name}, intanto una cosa può aiutarmi`
    : 'Intanto una cosa può aiutarmi';
}

export const PROCESSING_ACKS = [
  'Perfetto, questo mi aiuta.',
  'Ok, continuo a guardare.',
  'Questo dettaglio può essere utile.',
] as const;

export function homeGreeting(args: {
  ownerDisplayName?: string | null;
  dogName: string;
  birthdayToday?: boolean;
}): string {
  if (args.birthdayToday) return `Buon compleanno, ${args.dogName}! 🎉`;
  const owner = args.ownerDisplayName?.trim();
  if (owner) return `Ciao ${owner}, come sta ${args.dogName} oggi?`;
  return `Ciao, come sta ${args.dogName} oggi?`;
}

export function isPersonalBaselineNote(
  note: string | null | undefined,
): note is string {
  if (!note?.trim()) return false;
  const text = note.toLowerCase();
  return (
    !text.includes('sto ancora imparando') &&
    !text.includes('si basa soprattutto su ciò che vedo ora') &&
    !text.includes('non conosco ancora') &&
    !text.includes('nessun confronto')
  );
}

export function leaksInternalConsumerCopy(
  value: string | null | undefined,
): boolean {
  return CONSUMER_LEAK_PATTERN.test(value ?? '');
}

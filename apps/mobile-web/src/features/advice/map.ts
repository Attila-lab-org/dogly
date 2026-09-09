import type {
  AdviceCategory,
  AdviceItem,
  AdviceRisk,
} from './types';

export type ApiAdviceItem = {
  code?: string;
  category?: string;
  action?: string;
  rationale?: string;
  follow_up?: string;
  source_ids?: string[];
  action_text?: string;
  why_text?: string;
  risk?: string;
};

export function mapApiAdviceItem(raw: unknown): AdviceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as ApiAdviceItem;
  const actionText = item.action ?? item.action_text;
  const whyText = item.rationale ?? item.why_text;
  if (!item.code || !actionText || !whyText) return null;
  return {
    code: item.code,
    category: (item.category ?? 'ROUTINE') as AdviceCategory,
    actionText,
    whyText,
    followUp: item.follow_up,
    risk: (item.risk && item.risk !== 'LOW' ? 'CAUTION' : 'LOW') as AdviceRisk,
  };
}

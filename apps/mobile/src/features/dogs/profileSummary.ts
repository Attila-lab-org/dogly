import type { LifestyleProfile } from '../lifestyle/types';
import { LIFESTYLE_ACTIVITY_LABELS, LIFESTYLE_SLEEP_LABELS, LIFESTYLE_SOCIAL_LABELS } from '../lifestyle/types';
import type { DigestiveSummary } from '../digestive/api';

export function foodSummary(food: { brand?: string | null; name?: string | null } | null | undefined, quantity?: string | null): string {
  const brand = food?.brand?.trim() ?? '';
  const name = food?.name?.trim() ?? '';
  const label = name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase()) ? name : [brand, name].filter(Boolean).join(' ');
  return [label, quantity?.trim()].filter(Boolean).join(' · ');
}

export function routineSummary(profile: LifestyleProfile | null): string {
  if (!profile) return 'Raccontami le sue abitudini';
  const details = [
    profile.activity ? 'Attività: ' + LIFESTYLE_ACTIVITY_LABELS[profile.activity].toLocaleLowerCase() : null,
    profile.sleep ? 'Sonno ' + LIFESTYLE_SLEEP_LABELS[profile.sleep].toLocaleLowerCase() : null,
    profile.social ? 'Socialità: ' + LIFESTYLE_SOCIAL_LABELS[profile.social].toLocaleLowerCase() : null,
  ].filter(Boolean);
  return details.slice(0, 2).join(' · ') || 'Apri le sue abitudini';
}

export function digestiveSummaryLabel(summary: DigestiveSummary | undefined, loading = false, error = false): string {
  if (loading) return 'Carico le osservazioni…';
  if (error) return 'Non riesco ad aggiornare · Apri per riprovare';
  if (!summary || summary.data_sufficiency === 'insufficient') return 'Digestione · Ancora da osservare';
  if (summary.safety_flags.length > 0 || summary.recent_trend === 'worsening') return 'Digestione · Da osservare';
  if (summary.recent_trend === 'improving') return 'Digestione · In miglioramento';
  if (summary.recent_trend === 'firmer') return 'Digestione · Più formata';
  if (summary.recent_trend === 'softer') return 'Digestione · Più morbida';
  if (summary.recent_trend === 'stable' || (summary.variability ?? 99) <= 1) return 'Digestione · Stabile';
  return 'Digestione · Vedi andamento';
}

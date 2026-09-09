/**
 * Push the daily check-in to PATCH /v1/dogs/{id}/lifestyle so the reasoner
 * sees "oggi non è come al solito" as OWNER-REPORTED CHANGE, not a local banner.
 */
import { localDayKey } from './persistence';
import type { AnalysisCareContext } from './store';

export async function persistTodayVsUsual(
  dogId: string,
  context: NonNullable<AnalysisCareContext>,
  mockGate: boolean,
): Promise<void> {
  if (!dogId || mockGate) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { api } = require('../../lib/apiClient') as typeof import('../../lib/apiClient');
  await api.patch(`/v1/dogs/${dogId}/lifestyle`, {
    routine: {
      today_vs_usual: {
        concern: context.concern,
        note: context.note,
        day: localDayKey(),
      },
    },
    provenance: { today_vs_usual: 'OWNER_REPORTED' },
    confirm: true,
  });
}

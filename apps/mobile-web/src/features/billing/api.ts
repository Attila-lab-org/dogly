import { api } from '../../lib/apiClient';
import type { PlanCode, SubscriptionState } from '../secondary/types';

type UsageDomain = {
  limit: number;
  used: number;
  reserved: number;
};

type UsageLedgerDto = {
  behavior: UsageDomain;
  digestive: UsageDomain;
  reset_at: string;
};

type SubscriptionStatusDto = {
  plan: {
    plan: PlanCode;
    status: string;
    renews_at: string | null;
    max_active_dogs: number;
  };
  entitlement_source: string;
  limits: UsageLedgerDto;
};

type UsageResponseDto = {
  ledger: UsageLedgerDto;
};

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatusDto> {
  return api.get<SubscriptionStatusDto>('/v1/subscription/status');
}

export async function fetchUsage(): Promise<UsageResponseDto> {
  return api.get<UsageResponseDto>('/v1/usage');
}

export async function fetchSubscriptionState(): Promise<SubscriptionState> {
  const [status, usage] = await Promise.all([
    fetchSubscriptionStatus(),
    fetchUsage(),
  ]);
  return {
    plan: status.plan.plan,
    renewsAt: status.plan.renews_at,
    usage: {
      behaviorLimit: usage.ledger.behavior.limit,
      behaviorUsed: usage.ledger.behavior.used,
      digestiveLimit: usage.ledger.digestive.limit,
      digestiveUsed: usage.ledger.digestive.used,
      resetsAt: usage.ledger.reset_at,
    },
  };
}

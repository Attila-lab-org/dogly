import { createClient, createAdminDataClient } from "./supabase/server";
import { getAllowedAdminEmails } from "./supabase/env";

export type AdminOverview = {
  generatedAt: string;
  users: number;
  dogs: number;
  premiumUsers: number;
  behaviorToday: number;
  digestiveToday: number;
  aiCostToday: number | null;
  analyses7d: Array<{ day: string; comportamento: number; digestione: number }>;
  status: "operativo";
};

export class AdminDataUnavailableError extends Error {}

function startOfDayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date).replace(".", "");
}

async function requireAdmin() {
  const sessionClient = await createClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user?.email || !getAllowedAdminEmails().has(user.email.toLowerCase())) {
    throw new AdminDataUnavailableError("Accesso admin non autorizzato.");
  }
  const adminClient = createAdminDataClient();
  if (!adminClient) throw new AdminDataUnavailableError("Dati admin non configurati.");
  return adminClient;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await requireAdmin();
  const today = startOfDayIso();
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString();
  const [users, dogs, subscriptions, behavior, digestive, costs] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
    supabase.from("dogs").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("user_id", { count: "exact", head: true }).in("plan", ["PREMIUM_MONTHLY", "PREMIUM_ANNUAL", "PREMIUM"]),
    supabase.from("behavior_events").select("created_at", { count: "exact" }).gte("created_at", sevenDaysAgo),
    supabase.from("fecal_events").select("created_at", { count: "exact" }).gte("created_at", sevenDaysAgo),
    supabase.from("ai_cost_events").select("cost_usd").gte("created_at", today),
  ]);
  const failures = [dogs, subscriptions, behavior, digestive].filter((result) => result.error);
  if (users.error || failures.length > 0) throw new AdminDataUnavailableError("Supabase non ha restituito il read model admin.");

  const behaviorRows = behavior.data ?? [];
  const digestiveRows = digestive.data ?? [];
  const analyses7d = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const end = start + 86400000;
    return {
      day: dayLabel(date),
      comportamento: behaviorRows.filter((row) => { const time = Date.parse(row.created_at); return time >= start && time < end; }).length,
      digestione: digestiveRows.filter((row) => { const time = Date.parse(row.created_at); return time >= start && time < end; }).length,
    };
  });
  const aiCostToday = costs.error ? null : (costs.data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    users: users.data.total ?? users.data.users.length,
    dogs: dogs.count ?? 0,
    premiumUsers: subscriptions.count ?? 0,
    behaviorToday: behaviorRows.filter((row) => Date.parse(row.created_at) >= Date.parse(today)).length,
    digestiveToday: digestiveRows.filter((row) => Date.parse(row.created_at) >= Date.parse(today)).length,
    aiCostToday,
    analyses7d,
    status: "operativo",
  };
}

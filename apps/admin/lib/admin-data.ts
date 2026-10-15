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

import type { AdminUser, BehaviorEvent } from "./types";

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

export async function getAdminUsers(): Promise<AdminUser[]> {
  const supabase = await requireAdmin();
  const [authUsers, dogs, subscriptions, behavior] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("dogs").select("owner_id"),
    supabase.from("subscriptions").select("user_id, plan"),
    supabase.from("behavior_events").select("user_id, created_at"),
  ]);
  if (authUsers.error || dogs.error || subscriptions.error || behavior.error) {
    throw new AdminDataUnavailableError("Supabase non ha restituito gli utenti admin.");
  }
  const dogsByUser = new Map<string, number>();
  for (const dog of dogs.data ?? []) dogsByUser.set(dog.owner_id, (dogsByUser.get(dog.owner_id) ?? 0) + 1);
  const analysesByUser = new Map<string, number>();
  for (const event of behavior.data ?? []) analysesByUser.set(event.user_id, (analysesByUser.get(event.user_id) ?? 0) + 1);
  const planByUser = new Map((subscriptions.data ?? []).map((subscription) => [subscription.user_id, subscription.plan]));
  return authUsers.data.users.map((user) => ({
    id: user.id,
    name: (user.user_metadata?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? "Utente",
    emailMasked: user.email ? user.email.replace(/^(.{1,2})[^@]*(@.*)$/, "$1***$2") : "—",
    plan: planByUser.get(user.id)?.startsWith("PREMIUM") || planByUser.get(user.id) === "PREMIUM" ? "premium" : "free",
    dogsCount: dogsByUser.get(user.id) ?? 0,
    monthlyAnalyses: analysesByUser.get(user.id) ?? 0,
    lastAccess: user.last_sign_in_at ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.last_sign_in_at)) : "Mai",
    status: user.banned_until && new Date(user.banned_until) > new Date() ? "suspended" : "active",
    locale: (user.user_metadata?.locale as string | undefined) ?? "—",
    createdAt: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(user.created_at)),
  }));
}

export async function getAdminBehaviorEvents(): Promise<BehaviorEvent[]> {
  const supabase = await requireAdmin();
  const [events, dogs, feedback] = await Promise.all([
    supabase.from("behavior_events").select("id, dog_id, status, primary_intent, summary, confidence_band, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("dogs").select("id, name, breed_label"),
    supabase.from("behavior_feedback").select("event_id, value"),
  ]);
  if (events.error || dogs.error || feedback.error) throw new AdminDataUnavailableError("Supabase non ha restituito le analisi comportamentali.");
  const dogById = new Map((dogs.data ?? []).map((dog) => [dog.id, dog]));
  const feedbackByEvent = new Map((feedback.data ?? []).map((item) => [item.event_id, item.value]));
  return (events.data ?? []).map((event) => {
    const dog = dogById.get(event.dog_id);
    const status = event.status === "COMPLETED" ? "completed" : event.status === "FAILED" ? "failed" : "processing";
    const value = feedbackByEvent.get(event.id);
    return {
      id: event.id,
      dogName: dog?.name ?? "Cane",
      dogBreed: dog?.breed_label ?? "Razza non indicata",
      timestamp: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at)),
      interpretation: event.summary ?? event.primary_intent ?? "In attesa di interpretazione",
      confidenceBand: event.confidence_band === "HIGH" || event.confidence_band === "MEDIUM" ? event.confidence_band : "LOW",
      ownerFeedback: value === "yes" || value === "no" ? value : null,
      status,
    };
  });
}

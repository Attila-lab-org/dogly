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
  const monthStart = Date.now() - 30 * 86400000;
  const analysesByUser = new Map<string, number>();
  for (const event of behavior.data ?? []) {
    if (Date.parse(event.created_at) >= monthStart) analysesByUser.set(event.user_id, (analysesByUser.get(event.user_id) ?? 0) + 1);
  }
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
    const status = event.status === "COMPLETED" ? "completed" : String(event.status).startsWith("FAILED") ? "failed" : "processing";
    const value = String(feedbackByEvent.get(event.id) ?? "").toUpperCase();
    return {
      id: event.id,
      dogName: dog?.name ?? "Cane",
      dogBreed: dog?.breed_label ?? "Razza non indicata",
      timestamp: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at)),
      interpretation: event.summary ?? event.primary_intent ?? "In attesa di interpretazione",
      confidenceBand: event.confidence_band === "HIGH" || event.confidence_band === "MEDIUM" ? event.confidence_band : "LOW",
      ownerFeedback: value === "YES" ? "yes" : value === "NO" ? "no" : value === "UNKNOWN" ? "unsure" : null,
      status,
    };
  });
}

export async function getAdminUserDetail(userId: string): Promise<import("./types").UserDetail> {
  const supabase = await requireAdmin();
  const [auth, dogs, subscription, usage, behavior, digestive, consents] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("dogs").select("id, name, breed_label, birth_date, created_at").eq("owner_id", userId),
    supabase.from("subscriptions").select("plan, status, store, period_end").eq("user_id", userId).maybeSingle(),
    supabase.from("usage_ledgers").select("behavior_limit, behavior_used, digestive_limit, digestive_used").eq("user_id", userId).order("period_start", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("behavior_events").select("id, dog_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
    supabase.from("fecal_events").select("id, dog_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
    supabase.from("user_consents").select("consent_type, granted").eq("user_id", userId),
  ]);
  if (auth.error || dogs.error || subscription.error || usage.error || behavior.error || digestive.error || consents.error || !auth.data.user) {
    throw new AdminDataUnavailableError("Supabase non ha restituito il dettaglio utente.");
  }
  const user = auth.data.user;
  const dogRows = dogs.data ?? [];
  const behaviorRows = behavior.data ?? [];
  const digestiveRows = digestive.data ?? [];
  const planValue = String(subscription.data?.plan ?? "FREE");
  const plan = planValue.startsWith("PREMIUM") || planValue === "PREMIUM" ? "premium" : "free";
  const ledger = usage.data;
  const consentMap = new Map((consents.data ?? []).map((item) => [item.consent_type, item.granted]));
  const dogById = new Map(dogRows.map((dog) => [dog.id, dog]));
  const lastByDog = new Map<string, string>();
  for (const event of behaviorRows) if (!lastByDog.has(event.dog_id)) lastByDog.set(event.dog_id, event.created_at);
  return {
    id: user.id,
    name: (user.user_metadata?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? "Utente",
    emailMasked: user.email ? user.email.replace(/^(.{1,2})[^@]*(@.*)$/, "$1***$2") : "—",
    plan,
    dogsCount: dogRows.length,
    monthlyAnalyses: behaviorRows.filter((event) => Date.parse(event.created_at) >= Date.now() - 30 * 86400000).length,
    lastAccess: user.last_sign_in_at ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.last_sign_in_at)) : "Mai",
    status: user.banned_until && new Date(user.banned_until) > new Date() ? "suspended" : "active",
    locale: (user.user_metadata?.locale as string | undefined) ?? "—",
    createdAt: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(user.created_at)),
    subscription: { plan, renewal: subscription.data?.period_end ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(subscription.data.period_end)) : "—", platform: String(subscription.data?.store ?? "—"), quotaUsed: (ledger?.behavior_used ?? 0) + (ledger?.digestive_used ?? 0), quotaTotal: (ledger?.behavior_limit ?? 0) + (ledger?.digestive_limit ?? 0) },
    dogs: dogRows.map((dog) => ({ id: dog.id, name: dog.name, breed: dog.breed_label ?? "Non indicata", age: dog.birth_date ? `${new Date().getFullYear() - new Date(dog.birth_date).getFullYear()} anni` : "Età non indicata", knowledgeStatus: `${behaviorRows.filter((event) => event.dog_id === dog.id).length} eventi comportamentali`, lastAnalysis: lastByDog.get(dog.id) ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastByDog.get(dog.id)!)) : "Nessuna" })),
    usage30d: { behaviorEvents: behaviorRows.filter((event) => Date.parse(event.created_at) >= Date.now() - 30 * 86400000).length, digestiveEvents: digestiveRows.filter((event) => Date.parse(event.created_at) >= Date.now() - 30 * 86400000).length, retries: 0, quotaBlocks: 0 },
    consents: { service: consentMap.get("SERVICE_TERMS") ?? false, notifications: consentMap.get("NOTIFICATIONS") ?? false, research: consentMap.get("RESEARCH_TRAINING") ?? false, mediaRetention: consentMap.get("MEDIA_RETENTION") ?? false },
    supportRisk: { openTickets: 0, riskFlags: [] },
  };
}

export async function getAdminBehaviorEvent(eventId: string) {
  const supabase = await requireAdmin();
  const [event, feedback] = await Promise.all([
    supabase.from("behavior_events").select("id, dog_id, user_id, status, primary_intent, summary, confidence_band, created_at, completed_at").eq("id", eventId).maybeSingle(),
    supabase.from("behavior_feedback").select("value, correction_label, updated_at").eq("event_id", eventId).maybeSingle(),
  ]);
  if (event.error || feedback.error || !event.data) throw new AdminDataUnavailableError("Analisi non trovata.");
  return { ...event.data, feedback: feedback.data ?? null };
}

// Tipi del read-model admin. In V1 questi shape corrisponderanno
// alle risposte degli endpoint dedicati /v1/admin/* (vedi docs/ADMIN_CONTROL_CENTER.md).

export type Plan = "free" | "premium";
export type UserStatus = "active" | "suspended" | "deleted";
export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type EventStatus = "completed" | "processing" | "failed";
export type OwnerFeedback = "yes" | "no" | "unsure" | null;

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  deltaDirection: "up" | "down";
  explanation: string;
  icon: string; // chiave icona risolta dalla pagina
  spark: number[]; // 7 punti per la mini-sparkline
}

export interface ServiceStatus {
  name: string;
  status: "operativo" | "degradato" | "fermo";
  latencyMs: number;
}

export interface AdminUser {
  id: string;
  name: string;
  emailMasked: string;
  plan: Plan;
  dogsCount: number;
  monthlyAnalyses: number;
  lastAccess: string;
  status: UserStatus;
  locale: string;
  createdAt: string;
}

export interface Dog {
  id: string;
  name: string;
  breed: string;
  age: string;
  knowledgeStatus: string;
  lastAnalysis: string;
}

export interface UserDetail extends AdminUser {
  subscription: {
    plan: Plan;
    renewal: string;
    platform: string;
    quotaUsed: number;
    quotaTotal: number;
  };
  dogs: Dog[];
  usage30d: {
    behaviorEvents: number;
    digestiveEvents: number;
    retries: number;
    quotaBlocks: number;
  };
  consents: {
    service: boolean;
    notifications: boolean;
    research: boolean;
    mediaRetention: boolean;
  };
  supportRisk: {
    openTickets: number;
    riskFlags: string[];
  };
}

export interface BehaviorEvent {
  id: string;
  dogName: string;
  dogBreed: string;
  timestamp: string;
  interpretation: string;
  confidenceBand: ConfidenceBand;
  ownerFeedback: OwnerFeedback;
  status: EventStatus;
}

export type ReportType = "interpretazione" | "app" | "contenuto" | "pagamento";
export type ReportStatus = "da_leggere" | "in_gestione" | "risolta";
export type ReportPriority = "alta" | "normale";

export interface Report {
  id: string;
  type: ReportType;
  priority: ReportPriority;
  assignee: string;
  text: string;
  fullText: string;
  userName: string;
  userEmailMasked: string;
  dogName: string;
  eventId: string | null;
  date: string;
  status: ReportStatus;
  // Per le segnalazioni "Interpretazione sbagliata": feedback 3-vie sull'evento.
  eventFeedback: OwnerFeedback;
}

export interface InternalNote {
  id: string;
  author: string;
  date: string;
  text: string;
}

export type ActivityKind = "analisi" | "utente" | "segnalazione" | "errore" | "abbonamento";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  text: string;
  time: string;
  href: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
  result: "success" | "denied";
}

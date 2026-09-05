// Read-model mock per la V0 del Control Center.
// TODO(V1): sostituire questi export con fetch verso gli endpoint dedicati
// /v1/admin/* (read-model con RBAC server-side — vedi docs/ADMIN_CONTROL_CENTER.md).
// Le shape in lib/types.ts sono pensate per mappare 1:1 quelle risposte.

import type {
  ActivityItem,
  AdminUser,
  AuditEntry,
  BehaviorEvent,
  Kpi,
  Report,
  ServiceStatus,
  UserDetail,
} from "./types";

// ---------- Panoramica ----------

export const statusBanner = {
  ok: false,
  thingsToWatch: 10,
  subtitle: "2 problemi aperti · 5 segnalazioni da leggere · 3 cancellazioni in attesa",
};

export const overviewKpis: Kpi[] = [
  {
    label: "Utenti attivi (mese)",
    value: "128.549",
    delta: "+12,6%",
    deltaDirection: "up",
    explanation: "Persone che hanno aperto l'app negli ultimi 30 giorni",
    icon: "users",
    spark: [102, 108, 105, 112, 118, 121, 128],
  },
  {
    label: "Abbonati Premium",
    value: "38.217",
    delta: "+8,3%",
    deltaDirection: "up",
    explanation: "Utenti con abbonamento attivo",
    icon: "crown",
    spark: [31, 32, 33, 34, 35, 36, 38],
  },
  {
    label: "Ricavi mensili",
    value: "€1,62M",
    delta: "+10,7%",
    deltaDirection: "up",
    explanation: "Quanto incassiamo ogni mese dagli abbonamenti",
    icon: "euro",
    spark: [1.28, 1.32, 1.36, 1.41, 1.47, 1.55, 1.62],
  },
  {
    label: "Analisi fatte oggi",
    value: "34.573",
    delta: "+11,4%",
    deltaDirection: "up",
    explanation: "Comportamento + digestione, ultime 24 ore",
    icon: "activity",
    spark: [28.9, 29.4, 30.1, 31.2, 32.8, 33.5, 34.6],
  },
  {
    label: "Costo AI oggi",
    value: "$18.742",
    delta: "-6,3%",
    deltaDirection: "down",
    explanation: "Quanto ci costano oggi i modelli AI",
    icon: "wallet",
    spark: [21.4, 20.8, 20.1, 19.6, 19.9, 19.2, 18.7],
  },
];

// Feed "Attività recente" in Panoramica.
export const recentActivity: ActivityItem[] = [
  { id: "act-1", kind: "analisi", text: "Nuova analisi completata — Rocky (Sembra voler giocare)", time: "4 min fa", href: "/behavior/BE-94821" },
  { id: "act-2", kind: "segnalazione", text: "Segnalazione aperta — porzioni cucciolo", time: "12 min fa", href: "/segnalazioni/SEG-1038" },
  { id: "act-3", kind: "abbonamento", text: "Nuovo abbonamento Premium — Elena F.", time: "26 min fa", href: "/users/u-1007" },
  { id: "act-4", kind: "errore", text: "Analisi fallita — riprovata automaticamente", time: "41 min fa", href: "/sistema" },
  { id: "act-5", kind: "analisi", text: "Nuova analisi completata — Luna (Cerca attenzione)", time: "1 h fa", href: "/behavior/BE-94820" },
  { id: "act-6", kind: "utente", text: "Nuovo utente registrato — Luca M.", time: "2 h fa", href: "/users/u-1008" },
  { id: "act-7", kind: "segnalazione", text: "Segnalazione risolta — cambio carta di credito", time: "3 h fa", href: "/segnalazioni/SEG-1035" },
  { id: "act-8", kind: "abbonamento", text: "Rinnovo Premium — Giulia R.", time: "4 h fa", href: "/users/u-1003" },
];

export const todoCards = [
  {
    id: "todo-1",
    title: "Segnalazioni utenti",
    count: "5",
    note: "da leggere",
    href: "/segnalazioni",
    tone: "amber" as const,
    icon: "flag",
  },
  {
    id: "todo-2",
    title: "Analisi fallite",
    count: "23",
    note: "nell'ultima ora",
    href: "/sistema",
    tone: "red" as const,
    icon: "alert",
  },
  {
    id: "todo-3",
    title: "Richieste privacy",
    count: "3",
    note: "in attesa",
    href: "/privacy",
    tone: "amber" as const,
    icon: "lock",
  },
  {
    id: "todo-4",
    title: "Costo AI sopra la media",
    count: "+18%",
    note: "questa settimana",
    href: "/costi",
    tone: "amber" as const,
    icon: "wallet",
  },
];

export const serviceStatus: ServiceStatus[] = [
  { name: "Gemini", status: "operativo", latencyMs: 412 },
  { name: "OpenAI", status: "operativo", latencyMs: 388 },
  { name: "Supabase", status: "operativo", latencyMs: 46 },
  { name: "RevenueCat", status: "operativo", latencyMs: 121 },
];

export const costsToday = {
  aiSpend: "$18.742",
  aiSpendDelta: "-6,3% rispetto a ieri",
  avgBehavior: "$0.138",
  avgDigestive: "$0.094",
  budgetPct: 62,
};

export const analyses7d = [
  { day: "Lun", comportamento: 21240, digestione: 8640 },
  { day: "Mar", comportamento: 23110, digestione: 9020 },
  { day: "Mer", comportamento: 22480, digestione: 9310 },
  { day: "Gio", comportamento: 24920, digestione: 9480 },
  { day: "Ven", comportamento: 26150, digestione: 9760 },
  { day: "Sab", comportamento: 27380, digestione: 10120 },
  { day: "Dom", comportamento: 24731, digestione: 9842 },
];

// ---------- Sistema ----------

export const jobQueue = [
  { label: "In attesa", value: 12, tone: "gray" as const },
  { label: "In corso", value: 4, tone: "blue" as const },
  { label: "Falliti (ultima ora)", value: 23, tone: "red" as const },
];

export const recentErrors = [
  {
    id: "err-1",
    when: "14:02",
    text: "Gemini non raggiungibile — riprovato automaticamente con successo",
    tone: "amber" as const,
  },
  {
    id: "err-2",
    when: "13:47",
    text: "23 analisi comportamentali fallite nell'ultima ora — in indagine",
    tone: "red" as const,
  },
  {
    id: "err-3",
    when: "11:20",
    text: "Video caricato incompleto da un utente — l'analisi è stata annullata",
    tone: "amber" as const,
  },
  {
    id: "err-4",
    when: "09:15",
    text: "Sincronizzazione abbonamenti rallentata — risolta da sola in 4 minuti",
    tone: "gray" as const,
  },
];

// ---------- Segnalazioni ----------

export const reports: Report[] = [
  {
    id: "SEG-1042",
    priority: "alta",
    assignee: "Non assegnata",
    type: "interpretazione",
    text: "Rocky giocava ma l'app ha detto che era ansioso",
    fullText:
      "Ieri pomeriggio Rocky stava chiaramente giocando con me in salotto (faceva l'inchino e scodinzolava) ma l'app ha scritto che sembrava ansioso. Mi è sembrato strano, di solito ci azzecca.",
    userName: "Sara Martinelli",
    userEmailMasked: "s.m***@gmail.com",
    dogName: "Rocky",
    eventId: "BE-94821",
    date: "Oggi 09:12",
    status: "da_leggere",
    eventFeedback: "no",
  },
  {
    id: "SEG-1041",
    priority: "alta",
    assignee: "Non assegnata",
    type: "app",
    text: "Il video si blocca al 90% del caricamento",
    fullText:
      "Da ieri ogni volta che registro un video di Luna il caricamento arriva al 90% e poi si ferma. Ho provato con Wi-Fi e con 5G, stesso problema. Uso un Samsung Galaxy S23.",
    userName: "Marco Ferri",
    userEmailMasked: "m.f***@outlook.it",
    dogName: "Luna",
    eventId: null,
    date: "Oggi 08:55",
    status: "da_leggere",
    eventFeedback: null,
  },
  {
    id: "SEG-1040",
    priority: "normale",
    assignee: "Non assegnata",
    type: "interpretazione",
    text: "Secondo me Thor non voleva il cibo, voleva uscire",
    fullText:
      "L'analisi dice che Thor era in attesa del cibo, ma in quel momento era vicino alla porta e guardava il guinzaglio. Penso volesse solo uscire a fare una passeggiata.",
    userName: "Giulia Rinaldi",
    userEmailMasked: "g.r***@gmail.com",
    dogName: "Thor",
    eventId: "BE-94819",
    date: "Ieri 19:40",
    status: "da_leggere",
    eventFeedback: "no",
  },
  {
    id: "SEG-1039",
    priority: "alta",
    assignee: "Tu",
    type: "pagamento",
    text: "Mi è stato addebitato il rinnovo due volte",
    fullText:
      "Sul conto vedo due addebiti identici per il rinnovo Premium di settembre. Potete verificare e rimborsare uno dei due? Grazie.",
    userName: "Francesca Leone",
    userEmailMasked: "f.l***@gmail.com",
    dogName: "Nala",
    eventId: null,
    date: "Ieri 17:02",
    status: "in_gestione",
    eventFeedback: null,
  },
  {
    id: "SEG-1038",
    priority: "normale",
    assignee: "Non assegnata",
    type: "contenuto",
    text: "Il consiglio sull'alimentazione mi sembra sbagliato per un cucciolo",
    fullText:
      "Mia ha 4 mesi e nell'analisi della digestione l'app suggerisce porzioni che la mia veterinaria dice essere da cane adulto. Andrebbe corretto.",
    userName: "Elena Fontana",
    userEmailMasked: "e.f***@gmail.com",
    dogName: "Mia",
    eventId: null,
    date: "Ieri 12:31",
    status: "da_leggere",
    eventFeedback: null,
  },
  {
    id: "SEG-1037",
    priority: "normale",
    assignee: "Supporto",
    type: "app",
    text: "Le notifiche arrivano in ritardo di ore",
    fullText:
      "Il messaggio quotidiano su Rocky mi arriva la sera invece che la mattina. Ho controllato le impostazioni e sono corrette.",
    userName: "Sara Martinelli",
    userEmailMasked: "s.m***@gmail.com",
    dogName: "Rocky",
    eventId: null,
    date: "2 giorni fa",
    status: "in_gestione",
    eventFeedback: null,
  },
  {
    id: "SEG-1036",
    priority: "normale",
    assignee: "Team AI",
    type: "interpretazione",
    text: "Analisi giusta! Luna chiedeva davvero attenzione",
    fullText:
      "Volevo solo dire che l'analisi di ieri era perfetta: Luna stava proprio cercando la mia attenzione mentre lavoravo. Bravi.",
    userName: "Marco Ferri",
    userEmailMasked: "m.f***@outlook.it",
    dogName: "Luna",
    eventId: "BE-94820",
    date: "2 giorni fa",
    status: "risolta",
    eventFeedback: "yes",
  },
  {
    id: "SEG-1035",
    priority: "normale",
    assignee: "Supporto",
    type: "pagamento",
    text: "Non trovo come cambiare la carta di credito",
    fullText:
      "Vorrei aggiornare il metodo di pagamento ma non trovo l'opzione nell'app. Potete indicarmi dove si trova?",
    userName: "Luca Marchetti",
    userEmailMasked: "l.m***@hotmail.it",
    dogName: "Briciola",
    eventId: null,
    date: "3 giorni fa",
    status: "risolta",
    eventFeedback: null,
  },
];

// ---------- Utenti ----------

export const users: AdminUser[] = [
  { id: "u-1001", name: "Sara Martinelli", emailMasked: "s.m***@gmail.com", plan: "premium", dogsCount: 1, monthlyAnalyses: 260, lastAccess: "2 min fa", status: "active", locale: "it-IT", createdAt: "03/11/2025" },
  { id: "u-1002", name: "Marco Ferri", emailMasked: "m.f***@outlook.it", plan: "free", dogsCount: 1, monthlyAnalyses: 53, lastAccess: "14 min fa", status: "active", locale: "it-IT", createdAt: "18/01/2026" },
  { id: "u-1003", name: "Giulia Rinaldi", emailMasked: "g.r***@gmail.com", plan: "premium", dogsCount: 1, monthlyAnalyses: 153, lastAccess: "1 h fa", status: "active", locale: "it-IT", createdAt: "27/09/2025" },
  { id: "u-1004", name: "Alessandro Greco", emailMasked: "a.g***@libero.it", plan: "free", dogsCount: 1, monthlyAnalyses: 50, lastAccess: "3 h fa", status: "active", locale: "it-IT", createdAt: "02/03/2026" },
  { id: "u-1005", name: "Francesca Leone", emailMasked: "f.l***@gmail.com", plan: "premium", dogsCount: 1, monthlyAnalyses: 240, lastAccess: "Ieri", status: "active", locale: "it-IT", createdAt: "11/12/2025" },
  { id: "u-1006", name: "Davide Colombo", emailMasked: "d.c***@icloud.com", plan: "free", dogsCount: 1, monthlyAnalyses: 6, lastAccess: "2 gg fa", status: "suspended", locale: "it-IT", createdAt: "08/02/2026" },
  { id: "u-1007", name: "Elena Fontana", emailMasked: "e.f***@gmail.com", plan: "premium", dogsCount: 1, monthlyAnalyses: 385, lastAccess: "5 min fa", status: "active", locale: "it-IT", createdAt: "19/10/2025" },
  { id: "u-1008", name: "Luca Marchetti", emailMasked: "l.m***@hotmail.it", plan: "free", dogsCount: 1, monthlyAnalyses: 3, lastAccess: "12 gg fa", status: "active", locale: "it-IT", createdAt: "21/04/2026" },
];

export const userDetails: Record<string, UserDetail> = {
  "u-1001": {
    ...users[0],
    subscription: { plan: "premium", renewal: "01/10/2026", platform: "iOS — App Store", quotaUsed: 320, quotaTotal: 500 },
    dogs: [
      { id: "d-01", name: "Rocky", breed: "Golden Retriever", age: "3 anni", knowledgeStatus: "Profilo ricco — 214 eventi", lastAnalysis: "12 min fa" },
    ],
    usage30d: { behaviorEvents: 186, digestiveEvents: 74, retries: 3, quotaBlocks: 0 },
    consents: { service: true, notifications: true, research: false, mediaRetention: false },
    supportRisk: { openTickets: 0, riskFlags: [] },
  },
  "u-1002": {
    ...users[1],
    subscription: { plan: "free", renewal: "—", platform: "Android — Google Play", quotaUsed: 46, quotaTotal: 50 },
    dogs: [
      { id: "d-02", name: "Luna", breed: "Border Collie", age: "2 anni", knowledgeStatus: "Profilo base — 38 eventi", lastAnalysis: "1 h fa" },
    ],
    usage30d: { behaviorEvents: 41, digestiveEvents: 12, retries: 1, quotaBlocks: 2 },
    consents: { service: true, notifications: false, research: false, mediaRetention: false },
    supportRisk: { openTickets: 1, riskFlags: ["Quota quasi esaurita"] },
  },
  "u-1003": {
    ...users[2],
    subscription: { plan: "premium", renewal: "15/09/2026", platform: "iOS — App Store", quotaUsed: 155, quotaTotal: 500 },
    dogs: [
      { id: "d-03", name: "Thor", breed: "Pastore Tedesco", age: "5 anni", knowledgeStatus: "Profilo ricco — 167 eventi", lastAnalysis: "3 h fa" },
    ],
    usage30d: { behaviorEvents: 98, digestiveEvents: 55, retries: 0, quotaBlocks: 0 },
    consents: { service: true, notifications: true, research: true, mediaRetention: true },
    supportRisk: { openTickets: 0, riskFlags: [] },
  },
};

export function getUserDetail(id: string): UserDetail {
  const base = users.find((u) => u.id === id) ?? users[0];
  const existing = userDetails[base.id];
  if (existing) return existing;
  // Fallback generato per gli utenti senza dettaglio curato a mano.
  return {
    ...base,
    subscription: {
      plan: base.plan,
      renewal: base.plan === "premium" ? "01/11/2026" : "—",
      platform: "iOS — App Store",
      quotaUsed: Math.min(base.monthlyAnalyses, base.plan === "premium" ? 500 : 50),
      quotaTotal: base.plan === "premium" ? 500 : 50,
    },
    dogs: [
      { id: "d-x", name: "Rocky", breed: "Golden Retriever", age: "3 anni", knowledgeStatus: "Profilo base — 41 eventi", lastAnalysis: "2 gg fa" },
    ],
    usage30d: { behaviorEvents: 33, digestiveEvents: 9, retries: 0, quotaBlocks: 0 },
    consents: { service: true, notifications: true, research: false, mediaRetention: false },
    supportRisk: { openTickets: 0, riskFlags: base.status === "suspended" ? ["Account sospeso"] : [] },
  };
}

// ---------- Comportamento ----------

export const behaviorEvents: BehaviorEvent[] = [
  { id: "BE-94821", dogName: "Rocky", dogBreed: "Golden Retriever", timestamp: "Oggi 14:32", interpretation: "Sembra voler giocare", confidenceBand: "HIGH", ownerFeedback: "yes", status: "completed" },
  { id: "BE-94820", dogName: "Luna", dogBreed: "Border Collie", timestamp: "Oggi 14:18", interpretation: "Cerca attenzione dal proprietario", confidenceBand: "MEDIUM", ownerFeedback: "yes", status: "completed" },
  { id: "BE-94819", dogName: "Thor", dogBreed: "Pastore Tedesco", timestamp: "Oggi 13:57", interpretation: "In attesa del cibo", confidenceBand: "HIGH", ownerFeedback: null, status: "completed" },
  { id: "BE-94818", dogName: "Mia", dogBreed: "Jack Russell Terrier", timestamp: "Oggi 13:41", interpretation: "Eccitazione per l'arrivo di una persona conosciuta", confidenceBand: "MEDIUM", ownerFeedback: "no", status: "completed" },
  { id: "BE-94817", dogName: "Rocky", dogBreed: "Golden Retriever", timestamp: "Oggi 12:05", interpretation: "Rilassato e a proprio agio", confidenceBand: "HIGH", ownerFeedback: "yes", status: "completed" },
  { id: "BE-94816", dogName: "Luna", dogBreed: "Border Collie", timestamp: "Oggi 11:48", interpretation: "Curiosa verso un suono nuovo", confidenceBand: "LOW", ownerFeedback: null, status: "completed" },
  { id: "BE-94815", dogName: "Thor", dogBreed: "Pastore Tedesco", timestamp: "Oggi 11:20", interpretation: "—", confidenceBand: "LOW", ownerFeedback: null, status: "processing" },
  { id: "BE-94814", dogName: "Mia", dogBreed: "Jack Russell Terrier", timestamp: "Oggi 10:52", interpretation: "—", confidenceBand: "LOW", ownerFeedback: null, status: "failed" },
];

// ---------- Registro attività ----------

export const auditEntries: AuditEntry[] = [
  { id: "aud-1", timestamp: "05/09/2026 14:41", actor: "A-003", role: "Responsabile privacy", action: "Apertura video originale", target: "BE-94821", reason: "Verifica qualità interpretazione", result: "success" },
  { id: "aud-2", timestamp: "05/09/2026 14:12", actor: "A-007", role: "Assistenza clienti", action: "Richiesta export dati", target: "u-1001", reason: "Richiesta GDPR dell'utente", result: "success" },
  { id: "aud-3", timestamp: "05/09/2026 13:58", actor: "A-002", role: "Revisore AI", action: "Annotazione esperta", target: "BE-94818", reason: "Feedback negativo del proprietario", result: "success" },
  { id: "aud-4", timestamp: "05/09/2026 13:20", actor: "A-005", role: "Assistenza clienti", action: "Apertura video originale", target: "BE-94810", reason: "Ruolo non autorizzato", result: "denied" },
  { id: "aud-5", timestamp: "05/09/2026 12:47", actor: "A-001", role: "Super Admin", action: "Richiesta cancellazione", target: "u-1006", reason: "Richiesta utente via supporto", result: "success" },
  { id: "aud-6", timestamp: "05/09/2026 11:33", actor: "A-004", role: "Analista finanziario", action: "Lettura report costi", target: "costi/2026-09", reason: "Report mensile", result: "success" },
];

// ---------- Ricerca globale ----------

// Elenco piatto dei cani noti (per la ricerca globale in TopBar).
export const allDogs = Object.values(userDetails).flatMap((u) =>
  u.dogs.map((d) => ({
    id: d.id,
    name: d.name,
    breed: d.breed,
    ownerId: u.id,
    ownerName: u.name,
  })),
);

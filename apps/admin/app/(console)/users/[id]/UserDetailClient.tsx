"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Dog } from "lucide-react";
import Card from "@/components/Card";
import { PlanBadge, UserStatusBadge } from "@/components/StatusBadge";
import type { UserDetail } from "@/lib/types";

const CONSENT_LABELS: { key: "service" | "notifications" | "research" | "mediaRetention"; label: string }[] = [
  { key: "service", label: "Servizio (necessario)" },
  { key: "notifications", label: "Notifiche" },
  { key: "research", label: "Ricerca e miglioramento" },
  { key: "mediaRetention", label: "Conservazione media" },
];

export default function UserDetailPage({ user }: { user: UserDetail }) {
  const router = useRouter();
  const quotaUsed = user.subscription.quotaUsed;
  const quotaTotal = user.subscription.quotaTotal;
  const quotaPct = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 0;

  return (
    <div className="page">
      <button className="btn" onClick={() => router.push("/users")} style={{ marginBottom: 16 }}>
        <ArrowLeft size={15} /> Torna a Utenti e Cani
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{user.name}</h1>
        <UserStatusBadge status={user.status} />
        <PlanBadge plan={user.plan} />
      </div>
      <p className="page-subtitle">Scheda cliente — <span className="mono">{user.id}</span> · {user.emailMasked}</p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Card title="Identità"><dl className="dl">
          <div className="dl-row"><dt>ID utente</dt><dd className="mono">{user.id}</dd></div>
          <div className="dl-row"><dt>Stato</dt><dd><UserStatusBadge status={user.status} /></dd></div>
          <div className="dl-row"><dt>Locale</dt><dd>{user.locale}</dd></div>
          <div className="dl-row"><dt>Creato</dt><dd>{user.createdAt}</dd></div>
          <div className="dl-row"><dt>Ultimo accesso</dt><dd>{user.lastAccess}</dd></div>
        </dl></Card>
        <Card title="Abbonamento"><dl className="dl">
          <div className="dl-row"><dt>Piano</dt><dd><PlanBadge plan={user.subscription.plan} /></dd></div>
          <div className="dl-row"><dt>Rinnovo</dt><dd>{user.subscription.renewal}</dd></div>
          <div className="dl-row"><dt>Piattaforma</dt><dd>{user.subscription.platform}</dd></div>
        </dl><div style={{ marginTop: 14 }}>
          <div className="small" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span className="muted">Quota</span><strong>{quotaUsed} / {quotaTotal} eventi</strong></div>
          <div className="progress"><span style={{ width: `${quotaPct}%`, background: quotaPct >= 90 ? "var(--amber)" : "var(--primary)" }} /></div>
          <div className="small muted" style={{ marginTop: 6 }}>Rimanenti: {Math.max(0, quotaTotal - quotaUsed)}</div>
        </div></Card>
        <Card title="Utilizzo (30 giorni)"><dl className="dl">
          <div className="dl-row"><dt>Analisi comportamentali</dt><dd>{user.usage30d.behaviorEvents}</dd></div>
          <div className="dl-row"><dt>Analisi digestive</dt><dd>{user.usage30d.digestiveEvents}</dd></div>
          <div className="dl-row"><dt>Tentativi ripetuti</dt><dd>{user.usage30d.retries}</dd></div>
          <div className="dl-row"><dt>Blocchi quota</dt><dd>{user.usage30d.quotaBlocks}</dd></div>
        </dl></Card>
      </div>

      <Card title="Gestione account" subtitle="Sola lettura: le azioni operative saranno disponibili quando collegate al backend." style={{ marginTop: 16 }}>
        <p className="muted small" style={{ margin: 0 }}>Nessuna azione viene simulata da questa scheda.</p>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginTop: 16 }}>
        <Card title="Cani"><div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(user.dogs.length, 2))}, 1fr)` }}>
          {user.dogs.length === 0 ? <p className="muted small">Nessun cane associato.</p> : user.dogs.map((dog) => <div key={dog.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 14, display: "flex", gap: 12 }}>
            <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--teal-soft)", color: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Dog size={20} /></span>
            <div><div style={{ fontWeight: 700 }}>{dog.name}</div><div className="small muted">{dog.breed} · {dog.age}</div><div className="small" style={{ marginTop: 6 }}><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4, color: "var(--teal)" }} />{dog.knowledgeStatus}</div><div className="small muted">Ultima analisi: {dog.lastAnalysis}</div></div>
          </div>)}
        </div></Card>
        <Card title="Consensi" subtitle="Sola lettura — gestiti dall'app"><div style={{ display: "grid", gap: 12 }}>{CONSENT_LABELS.map(({ key, label }) => <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}><span className={`switch${user.consents[key] ? " on" : ""}`} aria-hidden />{label}</div>)}</div></Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
        <Card title="Assistenza e rischi"><dl className="dl"><div className="dl-row"><dt>Richieste di assistenza aperte</dt><dd>{user.supportRisk.openTickets}</dd></div><div className="dl-row"><dt>Punti di attenzione</dt><dd>{user.supportRisk.riskFlags.length === 0 ? "Nessuno" : user.supportRisk.riskFlags.map((f) => <span key={f} className="pill pill-amber" style={{ marginLeft: 6 }}>{f}</span>)}</dd></div></dl></Card>
        <Card title="Azioni sui dati" subtitle="Richieste gestite dal flusso privacy"><p className="muted small" style={{ margin: 0 }}>Le richieste export e cancellazione saranno disponibili quando il registro privacy sarà collegato.</p></Card>
      </div>
    </div>
  );
}

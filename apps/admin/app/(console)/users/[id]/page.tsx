"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  Dog,
  FileDown,
  Gift,
  Play,
  RotateCcw,
  StickyNote,
  Trash2,
} from "lucide-react";
import Card from "@/components/Card";
import { PlanBadge, UserStatusBadge } from "@/components/StatusBadge";
import { getUserDetail } from "@/lib/data";
import { addUserNote, logAction, useSession } from "@/lib/session";
import type { UserStatus } from "@/lib/types";

type DataAction = "export" | "delete";
type AdminAction = "bonus" | "sospendi" | "quota" | "nota";

const CONSENT_LABELS: { key: "service" | "notifications" | "research" | "mediaRetention"; label: string }[] = [
  { key: "service", label: "Servizio (necessario)" },
  { key: "notifications", label: "Notifiche" },
  { key: "research", label: "Ricerca e miglioramento" },
  { key: "mediaRetention", label: "Conservazione media" },
];

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = getUserDetail(params.id);
  const session = useSession();

  const [pendingAction, setPendingAction] = useState<DataAction | null>(null);
  const [adminAction, setAdminAction] = useState<AdminAction | null>(null);
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Stato ottimistico (solo demo, client-side)
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [quotaUsed, setQuotaUsed] = useState(user.subscription.quotaUsed);
  const [quotaTotal, setQuotaTotal] = useState(user.subscription.quotaTotal);

  const notes = session.userNotes[user.id] ?? [];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const confirmDataAction = () => {
    setPendingAction(null);
    logAction(
      pendingAction === "export" ? "Richiesta export dati" : "Richiesta cancellazione",
      user.id,
      "Azione dalla scheda cliente (demo)",
    );
    showToast("Richiesta registrata (demo)");
  };

  const confirmAdminAction = () => {
    if (adminAction === "bonus") {
      setQuotaTotal((t) => t + 5);
      logAction("Regalo 5 analisi bonus", user.id, "Gestione utente (demo)");
      showToast("Bonus accreditato (demo)");
    } else if (adminAction === "sospendi") {
      const next = status === "suspended" ? "active" : "suspended";
      setStatus(next);
      logAction(next === "suspended" ? "Sospensione account" : "Riattivazione account", user.id, "Gestione utente (demo)");
      showToast(next === "suspended" ? "Account sospeso (demo)" : "Account riattivato (demo)");
    } else if (adminAction === "quota") {
      setQuotaUsed(0);
      logAction("Reimpostazione quota mensile", user.id, "Gestione utente (demo)");
      showToast("Quota reimpostata (demo)");
    } else if (adminAction === "nota") {
      addUserNote(user.id, noteText.trim());
      setNoteText("");
      showToast("Nota aggiunta");
    }
    setAdminAction(null);
  };

  const quotaPct = Math.round((quotaUsed / quotaTotal) * 100);

  const ADMIN_MODAL: Record<AdminAction, { title: string; body: string; confirm: string; danger?: boolean }> = {
    bonus: {
      title: "Regala 5 analisi bonus",
      body: `La quota mensile di ${user.name} passerà da ${quotaTotal} a ${quotaTotal + 5} analisi. L'utente vedrà subito 5 analisi in più disponibili questo mese.`,
      confirm: "Accredita bonus",
    },
    sospendi: {
      title: status === "suspended" ? "Riattiva account" : "Sospendi account",
      body:
        status === "suspended"
          ? `${user.name} potrà di nuovo accedere all'app e usare tutte le funzioni del suo piano.`
          : `${user.name} non potrà più accedere all'app finché non riattiverai l'account. I dati restano salvati, niente viene cancellato.`,
      confirm: status === "suspended" ? "Riattiva" : "Sospendi",
      danger: status !== "suspended",
    },
    quota: {
      title: "Reimposta quota mensile",
      body: `Il contatore delle analisi usate questo mese da ${user.name} tornerà a 0 su ${quotaTotal}. Utile in caso di problemi o come gesto commerciale.`,
      confirm: "Reimposta quota",
    },
    nota: {
      title: "Aggiungi nota interna",
      body: "La nota sarà visibile solo al team interno, mai all'utente.",
      confirm: "Salva nota",
    },
  };

  return (
    <div className="page">
      <button className="btn" onClick={() => router.push("/users")} style={{ marginBottom: 16 }}>
        <ArrowLeft size={15} /> Torna a Utenti e Cani
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{user.name}</h1>
        <UserStatusBadge status={status} />
        <PlanBadge plan={user.plan} />
      </div>
      <p className="page-subtitle">
        Scheda cliente — <span className="mono">{user.id}</span> · {user.emailMasked}
      </p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Card title="Identità">
          <dl className="dl">
            <div className="dl-row"><dt>ID utente</dt><dd className="mono">{user.id}</dd></div>
            <div className="dl-row"><dt>Stato</dt><dd><UserStatusBadge status={status} /></dd></div>
            <div className="dl-row"><dt>Locale</dt><dd>{user.locale}</dd></div>
            <div className="dl-row"><dt>Creato</dt><dd>{user.createdAt}</dd></div>
            <div className="dl-row"><dt>Ultimo accesso</dt><dd>{user.lastAccess}</dd></div>
          </dl>
        </Card>

        <Card title="Abbonamento">
          <dl className="dl">
            <div className="dl-row"><dt>Piano</dt><dd><PlanBadge plan={user.subscription.plan} /></dd></div>
            <div className="dl-row"><dt>Rinnovo</dt><dd>{user.subscription.renewal}</dd></div>
            <div className="dl-row"><dt>Piattaforma</dt><dd>{user.subscription.platform}</dd></div>
          </dl>
          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="muted">Quota</span>
              <strong>
                {quotaUsed} / {quotaTotal} eventi
              </strong>
            </div>
            <div className="progress">
              <span
                style={{
                  width: `${quotaPct}%`,
                  background: quotaPct >= 90 ? "var(--amber)" : "var(--primary)",
                }}
              />
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Rimanenti: {quotaTotal - quotaUsed}
            </div>
          </div>
        </Card>

        <Card title="Utilizzo (30 giorni)">
          <dl className="dl">
            <div className="dl-row"><dt>Analisi comportamentali</dt><dd>{user.usage30d.behaviorEvents}</dd></div>
            <div className="dl-row"><dt>Analisi digestive</dt><dd>{user.usage30d.digestiveEvents}</dd></div>
            <div className="dl-row"><dt>Tentativi ripetuti</dt><dd>{user.usage30d.retries}</dd></div>
            <div className="dl-row"><dt>Blocchi quota</dt><dd>{user.usage30d.quotaBlocks}</dd></div>
          </dl>
        </Card>
      </div>

      {/* Azioni amministratore */}
      <Card title="Azioni amministratore" subtitle="Demo — ogni azione chiede conferma e finisce nel registro attività" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setAdminAction("bonus")}>
            <Gift size={15} /> Regala 5 analisi bonus
          </button>
          <button
            className={`btn ${status === "suspended" ? "" : "btn-danger"}`}
            onClick={() => setAdminAction("sospendi")}
          >
            {status === "suspended" ? <Play size={15} /> : <Ban size={15} />}
            {status === "suspended" ? " Riattiva account" : " Sospendi account"}
          </button>
          <button className="btn" onClick={() => setAdminAction("quota")}>
            <RotateCcw size={15} /> Reimposta quota mensile
          </button>
          <button className="btn" onClick={() => setAdminAction("nota")}>
            <StickyNote size={15} /> Aggiungi nota interna
          </button>
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginTop: 16 }}>
        <Card title="Cani">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(user.dogs.length, 2)}, 1fr)` }}>
            {user.dogs.map((dog) => (
              <div
                key={dog.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: 14,
                  display: "flex",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "var(--teal-soft)",
                    color: "#0f766e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <Dog size={20} />
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>{dog.name}</div>
                  <div className="small muted">
                    {dog.breed} · {dog.age}
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4, color: "var(--teal)" }} />
                    {dog.knowledgeStatus}
                  </div>
                  <div className="small muted">Ultima analisi: {dog.lastAnalysis}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Consensi" subtitle="Sola lettura — gestiti dall'app">
          <div style={{ display: "grid", gap: 12 }}>
            {CONSENT_LABELS.map(({ key, label }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span className={`switch${user.consents[key] ? " on" : ""}`} aria-hidden />
                {label}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
        <Card title="Assistenza e rischi">
          <dl className="dl">
            <div className="dl-row"><dt>Richieste di assistenza aperte</dt><dd>{user.supportRisk.openTickets}</dd></div>
            <div className="dl-row">
              <dt>Punti di attenzione</dt>
              <dd>
                {user.supportRisk.riskFlags.length === 0
                  ? "Nessuno"
                  : user.supportRisk.riskFlags.map((f) => (
                      <span key={f} className="pill pill-amber" style={{ marginLeft: 6 }}>{f}</span>
                    ))}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Azioni sui dati" subtitle="Privacy (GDPR) — demo V0, nessun effetto reale">
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={() => setPendingAction("export")}>
              <FileDown size={15} /> Richiedi export
            </button>
            <button className="btn btn-danger" onClick={() => setPendingAction("delete")}>
              <Trash2 size={15} /> Richiedi cancellazione
            </button>
          </div>
        </Card>
      </div>

      {/* Note interne */}
      <Card title="Note interne" subtitle="Visibili solo al team, mai all'utente" style={{ marginTop: 16 }}>
        {notes.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Nessuna nota. Aggiungine una da &quot;Azioni amministratore&quot;.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderLeft: "3px solid var(--teal)", paddingLeft: 12 }}>
                <div style={{ fontSize: 13 }}>{n.text}</div>
                <div className="small muted">
                  {n.author} · {n.date}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modale azioni sui dati */}
      {pendingAction && (
        <div className="modal-backdrop" onClick={() => setPendingAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              {pendingAction === "export" ? <Download size={18} /> : <Trash2 size={18} color="var(--red)" />}
              {pendingAction === "export" ? "Richiedi export dati" : "Richiedi cancellazione dati"}
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {pendingAction === "export"
                ? `Verrà registrata una richiesta di export per ${user.name} (${user.id}).`
                : `Verrà registrata una richiesta di cancellazione per ${user.name} (${user.id}).`}
              {" "}In V0 è solo una simulazione.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn" onClick={() => setPendingAction(null)}>Annulla</button>
              <button
                className={`btn ${pendingAction === "delete" ? "btn-danger" : "btn-primary"}`}
                onClick={confirmDataAction}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale azioni amministratore */}
      {adminAction && (
        <div className="modal-backdrop" onClick={() => setAdminAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 style={{ marginBottom: 8 }}>{ADMIN_MODAL[adminAction].title}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{ADMIN_MODAL[adminAction].body}</p>
            {adminAction === "nota" && (
              <textarea
                className="input"
                rows={3}
                aria-label="Testo della nota interna"
                placeholder="Scrivi la nota…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ resize: "vertical", marginBottom: 12 }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn" onClick={() => setAdminAction(null)}>Annulla</button>
              <button
                className={`btn ${ADMIN_MODAL[adminAction].danger ? "btn-danger" : "btn-primary"}`}
                disabled={adminAction === "nota" && noteText.trim().length === 0}
                style={adminAction === "nota" && noteText.trim().length === 0 ? { opacity: 0.5, cursor: "default" } : undefined}
                onClick={confirmAdminAction}
              >
                {ADMIN_MODAL[adminAction].confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} color="var(--teal)" />
          {toast}
        </div>
      )}
    </div>
  );
}

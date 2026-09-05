"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Dog,
  Hand,
  MessageSquare,
  Send,
  StickyNote,
} from "lucide-react";
import Card from "@/components/Card";
import {
  AssigneeBadge,
  FeedbackBadge,
  PriorityBadge,
  ReportStatusBadge,
  ReportTypeBadge,
} from "@/components/StatusBadge";
import { reports } from "@/lib/data";
import {
  addReportNote,
  logAction,
  setReportAssignee,
  setReportStatus,
  useSession,
} from "@/lib/session";

const ASSIGNEES = ["Non assegnata", "Tu", "Team AI", "Supporto"];

export default function SegnalazioneDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const report = reports.find((r) => r.id === params.id) ?? reports[0];
  const session = useSession();

  const status = session.reportStatus[report.id] ?? report.status;
  const assignee = session.reportAssignee[report.id] ?? report.assignee;
  const notes = session.reportNotes[report.id] ?? [];

  const [reply, setReply] = useState("");
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="page">
      <button className="btn" onClick={() => router.push("/segnalazioni")} style={{ marginBottom: 16 }}>
        <ArrowLeft size={15} /> Torna alle segnalazioni
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{report.id}</h1>
        <ReportTypeBadge type={report.type} />
        <PriorityBadge priority={report.priority} />
        <ReportStatusBadge status={status} />
        <AssigneeBadge assignee={assignee} />
      </div>
      <p className="page-subtitle">{report.date}</p>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card title="Cosa ci ha scritto l'utente">
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{report.fullText}</p>
            {report.type === "interpretazione" && report.eventFeedback && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--amber-soft)",
                  fontSize: 13,
                }}
              >
                Feedback dell&apos;utente sull&apos;evento:{" "}
                <FeedbackBadge feedback={report.eventFeedback} />
              </div>
            )}
          </Card>

          <Card title="Rispondi all'utente" subtitle="Demo — il messaggio non viene davvero inviato">
            <textarea
              className="input"
              rows={4}
              aria-label="Risposta all'utente"
              placeholder="Scrivi una risposta…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              style={{ resize: "vertical", marginBottom: 10 }}
            />
            <button
              className="btn btn-primary"
              disabled={reply.trim().length === 0}
              style={reply.trim().length === 0 ? { opacity: 0.5, cursor: "default" } : undefined}
              onClick={() => {
                setReply("");
                logAction("Risposta a segnalazione", report.id, "Risposta all'utente (demo)");
                showToast("Risposta inviata (demo)");
              }}
            >
              <Send size={15} /> Invia risposta
            </button>
          </Card>

          <Card title="Note interne" subtitle="Visibili solo al team">
            <div style={{ display: "flex", gap: 8, marginBottom: notes.length > 0 ? 14 : 0 }}>
              <input
                className="input"
                aria-label="Nuova nota interna"
                placeholder="Aggiungi una nota…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && noteText.trim()) {
                    addReportNote(report.id, noteText.trim());
                    setNoteText("");
                    showToast("Nota aggiunta");
                  }
                }}
              />
              <button
                className="btn"
                disabled={noteText.trim().length === 0}
                style={noteText.trim().length === 0 ? { opacity: 0.5, cursor: "default" } : undefined}
                onClick={() => {
                  addReportNote(report.id, noteText.trim());
                  setNoteText("");
                  showToast("Nota aggiunta");
                }}
              >
                <StickyNote size={15} /> Aggiungi
              </button>
            </div>
            {notes.length > 0 && (
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
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card title="Utente e cane">
            <dl className="dl">
              <div className="dl-row"><dt>Utente</dt><dd>{report.userName}</dd></div>
              <div className="dl-row"><dt>Email</dt><dd className="mono">{report.userEmailMasked}</dd></div>
              <div className="dl-row">
                <dt>Cane</dt>
                <dd style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Dog size={14} /> {report.dogName}
                </dd>
              </div>
              <div className="dl-row">
                <dt>Evento collegato</dt>
                <dd>
                  {report.eventId ? (
                    <Link href={`/behavior/${report.eventId}`} className="mono">
                      {report.eventId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Gestione">
            <label className="small" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
              Assegnata a
              <select
                className="input"
                aria-label="Assegna la segnalazione"
                value={assignee}
                onChange={(e) => {
                  setReportAssignee(report.id, e.target.value);
                  logAction("Assegnazione segnalazione", report.id, `Assegnata a: ${e.target.value} (demo)`);
                }}
                style={{ marginTop: 5 }}
              >
                {ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <button
                className="btn"
                disabled={status !== "da_leggere"}
                style={status !== "da_leggere" ? { opacity: 0.45, cursor: "default" } : undefined}
                onClick={() => {
                  setReportStatus(report.id, "in_gestione");
                  logAction("Presa in carico segnalazione", report.id, "Gestione segnalazione (demo)");
                  showToast("Segnalazione presa in carico");
                }}
              >
                <Hand size={15} /> Prendi in carico
              </button>
              <button
                className="btn"
                disabled={status === "risolta"}
                style={status === "risolta" ? { opacity: 0.45, cursor: "default" } : undefined}
                onClick={() => {
                  setReportStatus(report.id, "risolta");
                  logAction("Segnalazione risolta", report.id, "Gestione segnalazione (demo)");
                  showToast("Segnalazione segnata come risolta");
                }}
              >
                <CheckCircle2 size={15} /> Segna come risolta
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                <MessageSquare size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Le modifiche restano visibili nella lista per questa sessione (demo).
              </p>
            </div>
          </Card>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} color="var(--teal)" />
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import DataTable, { type Column } from "@/components/DataTable";
import {
  AssigneeBadge,
  PriorityBadge,
  ReportStatusBadge,
  ReportTypeBadge,
} from "@/components/StatusBadge";
import { reports } from "@/lib/data";
import { useSession } from "@/lib/session";
import type { Report, ReportStatus, ReportType } from "@/lib/types";

const STATUS_FILTERS: { key: ReportStatus | "tutte"; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_leggere", label: "Da leggere" },
  { key: "in_gestione", label: "In gestione" },
  { key: "risolta", label: "Risolte" },
];

const TYPE_FILTERS: { key: ReportType | "tutti"; label: string }[] = [
  { key: "tutti", label: "Tutti i tipi" },
  { key: "interpretazione", label: "Interpretazione sbagliata" },
  { key: "app", label: "Problema app" },
  { key: "contenuto", label: "Contenuto" },
  { key: "pagamento", label: "Pagamento" },
];

const columns: Column<Report & { liveStatus: ReportStatus; liveAssignee: string }>[] = [
  { key: "priority", header: "Priorità", render: (r) => <PriorityBadge priority={r.priority} /> },
  { key: "type", header: "Tipo", render: (r) => <ReportTypeBadge type={r.type} /> },
  {
    key: "text",
    header: "Segnalazione",
    render: (r) => (
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontWeight: 600 }}>{r.text}</div>
        <div className="small muted">
          {r.userName} · <span className="mono">{r.userEmailMasked}</span> · {r.dogName}
        </div>
      </div>
    ),
  },
  {
    key: "event",
    header: "Evento",
    render: (r) =>
      r.eventId ? (
        <Link href={`/behavior/${r.eventId}`} className="mono" onClick={(e) => e.stopPropagation()}>
          {r.eventId}
        </Link>
      ) : (
        <span className="muted">—</span>
      ),
  },
  { key: "assignee", header: "Assegnata a", render: (r) => <AssigneeBadge assignee={r.liveAssignee} /> },
  { key: "date", header: "Data", render: (r) => <span className="muted">{r.date}</span> },
  { key: "status", header: "Stato", render: (r) => <ReportStatusBadge status={r.liveStatus} /> },
];

export default function SegnalazioniPage() {
  const router = useRouter();
  const session = useSession();
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "tutte">("tutte");
  const [typeFilter, setTypeFilter] = useState<ReportType | "tutti">("tutti");

  // Applica le modifiche fatte nella sessione (stato / assegnazione dal dettaglio)
  const live = useMemo(
    () =>
      reports.map((r) => ({
        ...r,
        liveStatus: session.reportStatus[r.id] ?? r.status,
        liveAssignee: session.reportAssignee[r.id] ?? r.assignee,
      })),
    [session],
  );

  const filtered = useMemo(() => {
    const byType = typeFilter === "tutti" ? live : live.filter((r) => r.type === typeFilter);
    const byStatus =
      statusFilter === "tutte" ? byType : byType.filter((r) => r.liveStatus === statusFilter);
    // Le "Da leggere" con priorità Alta sempre in cima.
    return [...byStatus].sort((a, b) => {
      const score = (r: (typeof byStatus)[number]) =>
        r.liveStatus === "da_leggere" ? (r.priority === "alta" ? 0 : 1) : 2;
      return score(a) - score(b);
    });
  }, [live, statusFilter, typeFilter]);

  const countFor = (key: ReportStatus | "tutte") =>
    key === "tutte" ? live.length : live.filter((r) => r.liveStatus === key).length;

  return (
    <div className="page">
      <h1 className="page-title">Segnalazioni</h1>
      <p className="page-subtitle">
        Cosa ci scrivono gli utenti: errori dell&apos;AI, problemi dell&apos;app, pagamenti e contenuti.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }} role="group" aria-label="Filtra per stato">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              className="btn"
              aria-pressed={active}
              onClick={() => setStatusFilter(f.key)}
              style={
                active
                  ? { background: "var(--navy)", borderColor: "var(--navy)", color: "#fff" }
                  : undefined
              }
            >
              {f.label}
              <span className="small" style={{ opacity: 0.75 }}>({countFor(f.key)})</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }} role="group" aria-label="Filtra per tipo">
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              className="btn"
              aria-pressed={active}
              onClick={() => setTypeFilter(f.key)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                ...(active
                  ? { background: "var(--primary-soft)", borderColor: "var(--primary)", color: "var(--primary)" }
                  : {}),
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="small muted" style={{ marginBottom: 10 }}>
          {filtered.length} segnalazioni
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={(r) => router.push(`/segnalazioni/${r.id}`)}
          emptyTitle="Nessuna segnalazione con questi filtri"
        />
      </Card>
    </div>
  );
}

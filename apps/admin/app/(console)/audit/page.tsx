"use client";

import Card from "@/components/Card";
import DataTable, { type Column } from "@/components/DataTable";
import { auditEntries } from "@/lib/data";
import { useSession } from "@/lib/session";
import type { AuditEntry } from "@/lib/types";

const columns: Column<AuditEntry>[] = [
  { key: "ts", header: "Data", render: (a) => <span className="mono muted">{a.timestamp}</span> },
  { key: "actor", header: "Operatore", render: (a) => <span className="mono">{a.actor}</span> },
  {
    key: "role",
    header: "Ruolo",
    render: (a) =>
      a.actor === "A-TU" ? <span className="pill pill-teal">{a.role}</span> : a.role,
  },
  { key: "action", header: "Azione", render: (a) => <span style={{ fontWeight: 600 }}>{a.action}</span> },
  { key: "target", header: "Oggetto", render: (a) => <span className="mono">{a.target}</span> },
  { key: "reason", header: "Motivo", render: (a) => <span className="muted">{a.reason}</span> },
  {
    key: "result",
    header: "Esito",
    render: (a) =>
      a.result === "success" ? (
        <span className="pill pill-green">riuscita</span>
      ) : (
        <span className="pill pill-red">negata</span>
      ),
  },
];

export default function AuditPage() {
  const session = useSession();
  // Le righe fatte da "Tu" in questa sessione compaiono in cima (demo in memoria).
  const rows: AuditEntry[] = [...session.audit, ...auditEntries];

  return (
    <div className="page">
      <h1 className="page-title">Registro attività</h1>
      <p className="page-subtitle">
        Chi ha fatto cosa: ogni azione riservata resta scritta qui e non si può cancellare.
        Le azioni che fai in questa sessione compaiono in cima (demo).
      </p>
      <Card>
        <DataTable columns={columns} rows={rows} />
      </Card>
    </div>
  );
}

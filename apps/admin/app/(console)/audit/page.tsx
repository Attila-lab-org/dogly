import { getAdminAuditEntries, AdminDataUnavailableError } from "@/lib/admin-data";
import Card from "@/components/Card";
import DataTable, { type Column } from "@/components/DataTable";
import type { AuditEntry } from "@/lib/types";

const columns: Column<AuditEntry>[] = [
  { key: "ts", header: "Data", render: (a) => <span className="mono muted">{a.timestamp}</span> },
  { key: "actor", header: "Operatore", render: (a) => <span className="mono">{a.actor}</span> },
  { key: "role", header: "Ruolo", render: (a) => a.role },
  { key: "action", header: "Azione", render: (a) => <span style={{ fontWeight: 600 }}>{a.action}</span> },
  { key: "target", header: "Oggetto", render: (a) => <span className="mono">{a.target}</span> },
  { key: "reason", header: "Motivo", render: (a) => <span className="muted">{a.reason}</span> },
  { key: "result", header: "Esito", render: (a) => <span className={`pill ${a.result === "success" ? "pill-green" : "pill-red"}`}>{a.result === "success" ? "riuscita" : "negata"}</span> },
];

export default async function AuditPage() {
  try {
    const rows = await getAdminAuditEntries();
    return <div className="page"><h1 className="page-title">Registro attività</h1><p className="page-subtitle">Azioni persistenti del sistema e del team.</p><Card>{rows.length ? <DataTable columns={columns} rows={rows} /> : <p className="muted">Nessun evento registrato.</p>}</Card></div>;
  } catch (error) {
    const message = error instanceof AdminDataUnavailableError ? "Registro attività non disponibile." : "Errore nel caricamento del registro attività.";
    return <div className="page"><h1 className="page-title">Registro attività</h1><Card><p className="muted">{message}</p></Card></div>;
  }
}

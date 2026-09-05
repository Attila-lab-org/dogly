import Card from "@/components/Card";
import { jobQueue, recentErrors, serviceStatus } from "@/lib/data";

const QUEUE_TONE: Record<string, string> = {
  gray: "pill-gray",
  blue: "pill-blue",
  red: "pill-red",
};

const ERROR_TONE: Record<string, { dot: string }> = {
  red: { dot: "var(--red)" },
  amber: { dot: "var(--amber)" },
  gray: { dot: "var(--muted-light)" },
};

export default function SistemaPage() {
  return (
    <div className="page">
      <h1 className="page-title">Sistema</h1>
      <p className="page-subtitle">Salute dei servizi, lavori in coda ed errori recenti.</p>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <Card title="Stato del servizio">
          <div style={{ display: "grid", gap: 10 }}>
            {serviceStatus.map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span className="dot" style={{ background: "var(--green)" }} />
                <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                <span className="pill pill-green">Operativo</span>
                <span className="small muted">{s.latencyMs} ms</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Coda lavori" subtitle="Analisi in attesa di essere elaborate">
          <div style={{ display: "grid", gap: 10 }}>
            {jobQueue.map((q) => (
              <div
                key={q.label}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}
              >
                <span style={{ fontWeight: 600 }}>{q.label}</span>
                <span className={`pill ${QUEUE_TONE[q.tone]}`} style={{ fontSize: 13 }}>
                  {q.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Errori recenti" subtitle="In ordine dal più recente">
        <div>
          {recentErrors.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
              }}
            >
              <span className="dot" style={{ background: ERROR_TONE[e.tone].dot }} />
              <span style={{ flex: 1 }}>{e.text}</span>
              <span className="small muted">{e.when}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

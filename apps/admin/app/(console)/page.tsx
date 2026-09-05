import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Crown,
  Euro,
  Flag,
  Lock,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import Card from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import { AnalysesChart } from "@/components/Charts";
import {
  costsToday,
  overviewKpis,
  recentActivity,
  serviceStatus,
  statusBanner,
  todoCards,
} from "@/lib/data";
import type { ActivityKind } from "@/lib/types";

const KPI_ICONS: Record<string, React.ReactNode> = {
  users: <Users size={17} />,
  crown: <Crown size={17} />,
  euro: <Euro size={17} />,
  activity: <Activity size={17} />,
  wallet: <Wallet size={17} />,
};

const TODO_ICONS: Record<string, React.ReactNode> = {
  flag: <Flag size={20} />,
  alert: <AlertTriangle size={20} />,
  lock: <Lock size={20} />,
  wallet: <Wallet size={20} />,
};

const TONE: Record<string, { bg: string; fg: string }> = {
  red: { bg: "var(--red-soft)", fg: "var(--red)" },
  amber: { bg: "var(--amber-soft)", fg: "#b45309" },
  green: { bg: "var(--green-soft)", fg: "#15803d" },
};

const ACTIVITY_STYLE: Record<ActivityKind, { icon: React.ReactNode; bg: string }> = {
  analisi: { icon: <Activity size={15} color="#0f766e" />, bg: "var(--teal-soft)" },
  utente: { icon: <UserPlus size={15} color="var(--primary)" />, bg: "var(--primary-soft)" },
  abbonamento: { icon: <Crown size={15} color="var(--primary)" />, bg: "var(--primary-soft)" },
  segnalazione: { icon: <Flag size={15} color="#b45309" />, bg: "var(--amber-soft)" },
  errore: { icon: <XCircle size={15} color="var(--red)" />, bg: "var(--red-soft)" },
};

export default function PanoramicaPage() {
  const banner = statusBanner;

  return (
    <div className="page">
      <h1 className="page-title">Panoramica</h1>
      <p className="page-subtitle">Come sta andando Dogly oggi, in un colpo d&apos;occhio.</p>

      {/* Banner stato */}
      <section
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "20px 24px",
          marginBottom: 20,
          borderLeft: `5px solid ${banner.ok ? "var(--green)" : "var(--amber)"}`,
        }}
      >
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: banner.ok ? "var(--green-soft)" : "var(--amber-soft)",
            color: banner.ok ? "#15803d" : "#b45309",
          }}
        >
          {banner.ok ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
        </span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {banner.ok ? "Tutto funziona" : `Ci sono ${banner.thingsToWatch} cose da guardare`}
          </div>
          {!banner.ok && <div className="muted" style={{ marginTop: 2 }}>{banner.subtitle}</div>}
        </div>
      </section>

      {/* KPI semplici */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 20 }}>
        {overviewKpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            deltaDirection={kpi.deltaDirection}
            explanation={kpi.explanation}
            spark={kpi.spark}
            icon={KPI_ICONS[kpi.icon]}
          />
        ))}
      </div>

      {/* Da gestire */}
      <h2 style={{ fontSize: 16, margin: "4px 0 12px" }}>Da gestire</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
        {todoCards.map((card) => {
          const tone = TONE[card.tone];
          return (
            <Link
              key={card.id}
              href={card.href}
              className="card card-link"
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: tone.bg,
                    color: tone.fg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  {TODO_ICONS[card.icon]}
                </span>
                <div>
                  <div className="small muted" style={{ fontWeight: 600 }}>{card.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>
                    {card.count}{" "}
                    <span className="small muted" style={{ fontWeight: 500 }}>{card.note}</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Grafico */}
      <Card title="Analisi degli ultimi 7 giorni" subtitle="Comportamento e digestione a confronto" style={{ marginBottom: 20 }}>
        <AnalysesChart />
      </Card>

      {/* Attività recente + stato servizio + costi */}
      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
        <Card title="Attività recente">
          <div>
            {recentActivity.map((item) => {
              const style = ACTIVITY_STYLE[item.kind];
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 6px",
                    margin: "0 -6px",
                    borderRadius: "var(--radius-sm)",
                    borderBottom: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "inherit",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: style.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                    }}
                  >
                    {style.icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{item.text}</span>
                  <span className="small muted" style={{ flex: "none" }}>{item.time}</span>
                </Link>
              );
            })}
          </div>
        </Card>

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

        <Card title="Costi di oggi">
          <dl className="dl">
            <div className="dl-row">
              <dt>Costo AI</dt>
              <dd>
                {costsToday.aiSpend}{" "}
                <span className="small" style={{ color: "#15803d" }}>{costsToday.aiSpendDelta}</span>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Costo medio analisi comportamentale</dt>
              <dd>{costsToday.avgBehavior}</dd>
            </div>
            <div className="dl-row">
              <dt>Costo medio analisi digestiva</dt>
              <dd>{costsToday.avgDigestive}</dd>
            </div>
          </dl>
          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="muted">Budget del mese</span>
              <strong>{costsToday.budgetPct}% usato</strong>
            </div>
            <div className="progress">
              <span style={{ width: `${costsToday.budgetPct}%` }} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

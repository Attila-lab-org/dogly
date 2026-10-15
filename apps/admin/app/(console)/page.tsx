import { Activity, AlertTriangle, CheckCircle2, Crown, Dog, Euro, Users } from "lucide-react";
import Card from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import { AnalysesChart } from "@/components/Charts";
import { getAdminOverview, AdminDataUnavailableError } from "@/lib/admin-data";

function formatNumber(value: number) { return new Intl.NumberFormat("it-IT").format(value); }

export default async function PanoramicaPage() {
  let overview;
  try { overview = await getAdminOverview(); } catch (error) {
    if (!(error instanceof AdminDataUnavailableError)) throw error;
    return <div className="page"><h1 className="page-title">Panoramica</h1><p className="page-subtitle">Il centro di controllo Dogly, con dati verificati.</p><section className="card" style={{ display: "flex", alignItems: "center", gap: 16, padding: 24, borderLeft: "5px solid var(--amber)" }}><span style={{ width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--amber-soft)", color: "#b45309" }}><AlertTriangle size={24} /></span><div><strong style={{ fontSize: 18 }}>Dati live non disponibili</strong><p className="muted" style={{ margin: "4px 0 0" }}>La console è collegata all&apos;account, ma manca la connessione server sicura al read model. Nessun dato demo viene mostrato.</p></div></section></div>;
  }
  const kpis = [
    ["Utenti", formatNumber(overview.users), "Account registrati", <Users size={17} />],
    ["Cani", formatNumber(overview.dogs), "Profili creati", <Dog size={17} />],
    ["Premium", formatNumber(overview.premiumUsers), "Abbonamenti attivi", <Crown size={17} />],
    ["Analisi oggi", formatNumber(overview.behaviorToday + overview.digestiveToday), `${formatNumber(overview.behaviorToday)} comportamento · ${formatNumber(overview.digestiveToday)} digestione`, <Activity size={17} />],
    ["Costo AI oggi", overview.aiCostToday === null ? "—" : `€${overview.aiCostToday.toFixed(2)}`, overview.aiCostToday === null ? "Costo non esposto dal database" : "Da eventi AI registrati", <Euro size={17} />],
  ] as const;
  return <div className="page"><h1 className="page-title">Panoramica</h1><p className="page-subtitle">La situazione reale di Dogly, aggiornata adesso.</p><section className="card" style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", marginBottom: 20, borderLeft: "5px solid var(--green)" }}><span style={{ width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--green-soft)", color: "#15803d" }}><CheckCircle2 size={24} /></span><div><strong style={{ fontSize: 18 }}>Dati live collegati</strong><div className="muted" style={{ marginTop: 2 }}>Ultimo aggiornamento {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.generatedAt))}</div></div></section><div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 20 }}>{kpis.map(([label, value, explanation, icon]) => <KpiCard key={label} label={label} value={value} delta="Live" deltaDirection="up" explanation={explanation} spark={[0, 0, 0, 0, 0, 0, Number(value.replace(/[^0-9]/g, "")) || 0]} icon={icon} />)}</div><Card title="Analisi degli ultimi 7 giorni" subtitle="Eventi realmente registrati in Supabase" style={{ marginBottom: 20 }}><AnalysesChart data={overview.analyses7d} /></Card><div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}><Card title="Stato dati"><div style={{ display: "grid", gap: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ background: "var(--green)" }} /><strong>Supabase</strong><span className="pill pill-green" style={{ marginLeft: "auto" }}>Operativo</span></div><div className="muted small">Metriche calcolate da utenti, cani, eventi e abbonamenti reali.</div></div></Card><Card title="Cosa richiede attenzione"><div className="muted">Le segnalazioni, la coda lavori e l&apos;audit verranno mostrati appena collegati ai rispettivi read model server-side.</div></Card></div></div>;
}

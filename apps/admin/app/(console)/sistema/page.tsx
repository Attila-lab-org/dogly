import Card from "@/components/Card";

export default function SistemaPage() {
  return <div className="page"><h1 className="page-title">Sistema</h1><p className="page-subtitle">Salute dei servizi, coda lavori ed errori recenti.</p><Card><div style={{ padding: "40px 24px", textAlign: "center" }}><h2 style={{ fontSize: 18, marginBottom: 8 }}>Dati operativi in collegamento</h2><p className="muted" style={{ maxWidth: 520, margin: "0 auto" }}>La console non mostra numeri simulati. La coda lavori, gli errori e le latenze appariranno quando sarà disponibile il read model operativo server-side.</p></div></Card></div>;
}

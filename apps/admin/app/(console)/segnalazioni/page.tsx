import Card from "@/components/Card";

export default function ReportsPage() {
  return <div className="page"><h1 className="page-title">Segnalazioni</h1><p className="page-subtitle">Le segnalazioni degli utenti saranno mostrate quando il flusso persistente sarà collegato.</p><Card><p className="muted" style={{ margin: 0 }}>Nessuna segnalazione live disponibile. Non vengono mostrati dati dimostrativi.</p></Card></div>;
}

import Card from "@/components/Card";

export default function AuditPage() {
  return <div className="page"><h1 className="page-title">Registro attività</h1><p className="page-subtitle">Le azioni amministrative saranno mostrate qui quando il registro persistente sarà collegato.</p><Card><p className="muted" style={{ margin: 0 }}>Nessun evento live disponibile. Non vengono mostrati dati dimostrativi.</p></Card></div>;
}

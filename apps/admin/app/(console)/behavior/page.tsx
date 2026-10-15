import BehaviorTable from "./BehaviorTable";
import { AdminDataUnavailableError, getAdminBehaviorEvents } from "@/lib/admin-data";

export default async function ComportamentoPage() {
  try {
    const events = await getAdminBehaviorEvents();
    return <div className="page"><h1 className="page-title">Comportamento</h1><p className="page-subtitle">Analisi comportamentali reali registrate da Dogly.</p><BehaviorTable events={events} /></div>;
  } catch (error) {
    if (!(error instanceof AdminDataUnavailableError)) throw error;
    return <div className="page"><h1 className="page-title">Comportamento</h1><p className="page-subtitle">Analisi comportamentali reali registrate da Dogly.</p><div className="card muted">Dati live non disponibili. Nessun evento demo viene mostrato.</div></div>;
  }
}

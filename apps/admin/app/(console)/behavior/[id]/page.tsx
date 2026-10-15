import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Card from "@/components/Card";
import { BandPill, FeedbackBadge, StatusBadge } from "@/components/StatusBadge";
import { AdminDataUnavailableError, getAdminBehaviorEvent } from "@/lib/admin-data";

export default async function BehaviorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const event = await getAdminBehaviorEvent(id);
    const status = event.status === "COMPLETED" ? "completed" : event.status === "FAILED" || event.status === "FAILED_TERMINAL" || event.status === "FAILED_RETRYABLE" ? "failed" : "processing";
    const band = event.confidence_band === "HIGH" || event.confidence_band === "MEDIUM" ? event.confidence_band : "LOW";
    const feedback = event.feedback?.value === "YES" ? "yes" : event.feedback?.value === "NO" ? "no" : event.feedback?.value === "UNKNOWN" ? "unsure" : null;
    return <div className="page"><Link href="/behavior" className="btn" style={{ display: "inline-flex", marginBottom: 16 }}><ArrowLeft size={15} /> Torna alle analisi</Link><h1 className="page-title">Dettaglio analisi</h1><p className="page-subtitle"><span className="mono">{event.id}</span> · {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</p><div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}><Card title="Stato"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><StatusBadge status={status} />{status === "completed" ? <CheckCircle2 size={18} color="var(--green)" /> : status === "failed" ? <AlertTriangle size={18} color="var(--red)" /> : null}</div></Card><Card title="Confidenza e feedback"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><BandPill band={band} /><FeedbackBadge feedback={feedback} /></div></Card></div><Card title="Interpretazione" style={{ marginTop: 16 }}><p style={{ fontSize: 18, fontWeight: 600 }}>{event.summary ?? event.primary_intent ?? "Nessuna interpretazione disponibile"}</p><p className="small muted">Dog ID: <span className="mono">{event.dog_id}</span></p>{event.feedback?.correction_label ? <p className="small">Correzione proprietario: {event.feedback.correction_label}</p> : null}</Card></div>;
  } catch (error) {
    if (error instanceof AdminDataUnavailableError) return <div className="page"><h1 className="page-title">Analisi non disponibile</h1><p className="muted">Questa analisi non esiste nel read model live oppure non è ancora configurato.</p></div>;
    throw error;
  }
}

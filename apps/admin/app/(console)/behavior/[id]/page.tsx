"use client";

import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSearch,
  Lock,
  PawPrint,
  PenLine,
  Share2,
} from "lucide-react";
import Card from "@/components/Card";
import { BandPill } from "@/components/StatusBadge";
import { behaviorEvents } from "@/lib/data";

const OBSERVATIONS = [
  "Il cane si avvicina rapidamente alla persona",
  "Corpo abbassato in avanti (inchino da gioco)",
  "Coda in movimento, ampiezza da media ad alta",
  "Orecchie rilassate, bocca aperta e rilassata",
  "Nessun segno di tensione o di disagio",
];

const EVIDENCE = [
  { main: "Ha mantenuto l'inchino da gioco per circa 2 secondi", tech: "Sustained play bow (~2s)" },
  { main: "Coda sciolta in movimento, a mezza altezza", tech: "Loose, mid-height tail wag" },
  { main: "Si è avvicinato direttamente, senza segnali di stress", tech: "Direct approach, no stress signals" },
];

const ALTERNATIVES = [
  { label: "Cerca attenzione", value: 0.08 },
  { label: "Saluto / socialità", value: 0.04 },
  { label: "Eccitazione generica", value: 0.02 },
];

const QUICK_ACTIONS = [
  { icon: FileSearch, label: "Apri dettaglio tecnico" },
  { icon: PenLine, label: "Aggiungi nota dell'esperto" },
  { icon: PawPrint, label: "Vedi la scheda del cane" },
  { icon: Share2, label: "Condividi con il team" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dl-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ComportamentoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const idx = Math.max(0, behaviorEvents.findIndex((e) => e.id === params.id));
  const event = behaviorEvents[idx] ?? behaviorEvents[0];
  const prev = behaviorEvents[idx - 1];
  const next = behaviorEvents[idx + 1];

  return (
    <div className="page">
      {/* Intestazione */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/behavior")}>
          <ArrowLeft size={15} /> Indietro
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {event.id} — {event.dogName} <span className="muted" style={{ fontWeight: 400 }}>({event.dogBreed})</span>
        </h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            disabled={!prev}
            style={!prev ? { opacity: 0.4, cursor: "default" } : undefined}
            onClick={() => prev && router.push(`/behavior/${prev.id}`)}
          >
            <ArrowLeft size={15} /> Precedente
          </button>
          <button
            className="btn"
            disabled={!next}
            style={!next ? { opacity: 0.4, cursor: "default" } : undefined}
            onClick={() => next && router.push(`/behavior/${next.id}`)}
          >
            Successivo <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <p className="page-subtitle">Dettaglio dell&apos;analisi comportamentale.</p>

      {/* Riga stato */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <CheckCircle2 size={16} color="var(--green)" /> Stato: Completata
          </span>
          <span><span className="muted">Registrata:</span> <strong>{event.timestamp}</strong></span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted">Confidenza:</span> <BandPill band="HIGH" />
            <span className="small muted mono">(0.86)</span>
          </span>
          <span><span className="muted">Feedback proprietario:</span> <strong>Sì</strong></span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={14} color="var(--teal)" /> <span className="muted">Privacy:</span> <strong>Attiva</strong>
          </span>
        </div>
      </Card>

      {/* Video / Osservazioni / Contesto / Azioni rapide */}
      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr" }}>
        <Card title="Video registrato">
          <div
            style={{
              height: 150,
              borderRadius: "var(--radius-sm)",
              background:
                "repeating-linear-gradient(45deg, #dbe4f0, #dbe4f0 12px, #cdd9e8 12px, #cdd9e8 24px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 6,
              color: "var(--navy)",
            }}
          >
            <Lock size={20} />
            <span className="small" style={{ fontWeight: 600 }}>
              Media disponibile — Clicca per vedere (autorizzato)
            </span>
          </div>
          <p className="small muted" style={{ margin: "8px 0 12px" }}>Sfocato per privacy</p>
          <dl className="dl">
            <Row label="Fonte">App mobile — iOS</Row>
            <Row label="Registrato da">Proprietario</Row>
            <Row label="Luogo">Casa</Row>
            <Row label="Durata">00:07</Row>
          </dl>
        </Card>

        <Card title="Cosa ha visto l'AI">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {OBSERVATIONS.map((o) => (
              <li key={o} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <Check size={15} color="var(--teal)" style={{ flex: "none", marginTop: 2 }} />
                {o}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Contesto">
          <dl className="dl">
            <Row label="Ambiente">Interno — soggiorno</Row>
            <Row label="Persone presenti">Una persona conosciuta</Row>
            <Row label="Poco prima">La persona è entrata nella stanza</Row>
            <Row label="Momento del giorno">Pomeriggio</Row>
          </dl>
        </Card>

        <Card title="Azioni rapide">
          <div style={{ display: "grid", gap: 4 }}>
            {QUICK_ACTIONS.map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--navy)",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f6fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon size={16} color="var(--primary)" /> {label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Interpretazione + Perché l'AI lo pensa */}
      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", marginTop: 16 }}>
        <Card title="Interpretazione">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 18 }}>Sembra voler giocare</h2>
            <span className="pill pill-green">0.86 (Alta)</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 8 }}>
              Altre possibilità considerate
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {ALTERNATIVES.map((a) => (
                <div key={a.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{a.label}</span>
                  <span className="mono muted">{a.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Generata dal modello comportamentale Dogly • Spiegabilità attiva
          </p>
        </Card>

        <Card title="Perché l'AI lo pensa">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
            {EVIDENCE.map((e) => (
              <li key={e.tech} style={{ fontSize: 13 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Check size={15} color="var(--teal)" style={{ flex: "none", marginTop: 2 }} />
                  {e.main}
                </div>
                <div className="small muted" style={{ marginLeft: 23 }}>{e.tech}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Esito / Effetto sulla conoscenza del cane / Dettaglio tecnico */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1.2fr", marginTop: 16 }}>
        <Card title="Feedback ed esito">
          <dl className="dl">
            <Row label="Conferma del proprietario">Sì — interpretazione corretta</Row>
            <Row label="Esito">Interazione positiva</Row>
          </dl>
        </Card>

        <Card title="Cosa impara Dogly su Rocky">
          <p style={{ margin: "0 0 10px", fontSize: 13 }}>
            Conferma un comportamento già noto — <strong>Invita al gioco le persone che conosce</strong>
          </p>
          <span className="pill pill-amber">Conferma preliminare</span>
        </Card>

        <Card title="Dettaglio tecnico">
          <dl className="dl">
            <Row label="Provider / Modello">OpenAI GPT-4o-mini</Row>
            <Row label="Versione modello"><span className="mono">cbm-2026.08.3</span></Row>
            <Row label="Versione schema"><span className="mono">v1.4.2</span> <span className="pill pill-green">Valido</span></Row>
            <Row label="Tentativi">0</Row>
            <Row label="Tempo di risposta">1.42s</Row>
            <Row label="Costo totale">$0.0043</Row>
            <Row label="Trace ID"><span className="mono">trc_9f7a2b1e8c4d</span></Row>
          </dl>
        </Card>
      </div>

      {/* Registro + footer */}
      <Card title="Registro" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", fontSize: 13 }}>
          <span><span className="muted">Creata:</span> <strong>05/09/2026 14:32</strong></span>
          <span><span className="muted">Ultimo aggiornamento:</span> <strong>05/09/2026 14:33</strong></span>
          <span><span className="muted">Accesso:</span> <strong>Solo ruoli autorizzati</strong></span>
          <span><span className="muted">Conservazione dati:</span> <strong>Cancellazione automatica tra 173 giorni</strong></span>
        </div>
      </Card>
      <p className="small muted" style={{ textAlign: "center", marginTop: 20 }}>
        Privacy fin dal progetto • Media sfocati • Dati ridotti al minimo • Accesso controllato
      </p>
    </div>
  );
}

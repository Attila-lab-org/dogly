"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import DataTable, { type Column } from "@/components/DataTable";
import { BandPill, FeedbackBadge, StatusBadge } from "@/components/StatusBadge";
import { behaviorEvents } from "@/lib/data";
import type { BehaviorEvent, ConfidenceBand, EventStatus } from "@/lib/types";

const columns: Column<BehaviorEvent>[] = [
  { key: "id", header: "ID", render: (e) => <span className="mono" style={{ fontWeight: 600 }}>{e.id}</span> },
  {
    key: "dog",
    header: "Cane",
    render: (e) => (
      <div>
        <div style={{ fontWeight: 600 }}>{e.dogName}</div>
        <div className="small muted">{e.dogBreed}</div>
      </div>
    ),
  },
  { key: "ts", header: "Data e ora", render: (e) => <span className="muted">{e.timestamp}</span> },
  { key: "interp", header: "Interpretazione", render: (e) => e.interpretation },
  { key: "band", header: "Confidenza", render: (e) => <BandPill band={e.confidenceBand} /> },
  { key: "feedback", header: "Feedback proprietario", render: (e) => <FeedbackBadge feedback={e.ownerFeedback} /> },
  { key: "status", header: "Stato", render: (e) => <StatusBadge status={e.status} /> },
];

type FeedbackFilter = "tutti" | "yes" | "no" | "senza";

export default function ComportamentoPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<EventStatus | "tutti">("tutti");
  const [bandFilter, setBandFilter] = useState<ConfidenceBand | "tutte">("tutte");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("tutti");

  const filtered = useMemo(
    () =>
      behaviorEvents.filter((e) => {
        if (statusFilter !== "tutti" && e.status !== statusFilter) return false;
        if (bandFilter !== "tutte" && e.confidenceBand !== bandFilter) return false;
        if (feedbackFilter === "yes" && e.ownerFeedback !== "yes") return false;
        if (feedbackFilter === "no" && e.ownerFeedback !== "no") return false;
        if (feedbackFilter === "senza" && e.ownerFeedback !== null) return false;
        return true;
      }),
    [statusFilter, bandFilter, feedbackFilter],
  );

  return (
    <div className="page">
      <h1 className="page-title">Comportamento</h1>
      <p className="page-subtitle">
        Le analisi comportamentali fatte dall&apos;AI. La confidenza è a fasce (Bassa / Media / Alta), mai in percentuale.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="small" style={{ fontWeight: 600 }}>
          Stato
          <select
            className="input"
            aria-label="Filtra per stato"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EventStatus | "tutti")}
            style={{ display: "block", marginTop: 4, minWidth: 150 }}
          >
            <option value="tutti">Tutti</option>
            <option value="completed">Completate</option>
            <option value="processing">In corso</option>
            <option value="failed">Fallite</option>
          </select>
        </label>
        <label className="small" style={{ fontWeight: 600 }}>
          Confidenza
          <select
            className="input"
            aria-label="Filtra per confidenza"
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value as ConfidenceBand | "tutte")}
            style={{ display: "block", marginTop: 4, minWidth: 150 }}
          >
            <option value="tutte">Tutte</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Bassa</option>
          </select>
        </label>
        <label className="small" style={{ fontWeight: 600 }}>
          Feedback proprietario
          <select
            className="input"
            aria-label="Filtra per feedback del proprietario"
            value={feedbackFilter}
            onChange={(e) => setFeedbackFilter(e.target.value as FeedbackFilter)}
            style={{ display: "block", marginTop: 4, minWidth: 150 }}
          >
            <option value="tutti">Tutti</option>
            <option value="yes">Sì</option>
            <option value="no">No</option>
            <option value="senza">Senza</option>
          </select>
        </label>
      </div>

      <Card>
        <div className="small muted" style={{ marginBottom: 10 }}>
          {filtered.length} eventi
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={(e) => router.push(`/behavior/${e.id}`)}
          emptyTitle="Nessun evento con questi filtri"
        />
      </Card>
    </div>
  );
}

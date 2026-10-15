"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import DataTable, { type Column } from "@/components/DataTable";
import { BandPill, FeedbackBadge, StatusBadge } from "@/components/StatusBadge";
import type { BehaviorEvent, ConfidenceBand, EventStatus } from "@/lib/types";

type FeedbackFilter = "tutti" | "yes" | "no" | "senza";
const columns: Column<BehaviorEvent>[] = [
  { key: "id", header: "ID", render: (e) => <span className="mono" style={{ fontWeight: 600 }}>{e.id}</span> },
  { key: "dog", header: "Cane", render: (e) => <div><div style={{ fontWeight: 600 }}>{e.dogName}</div><div className="small muted">{e.dogBreed}</div></div> },
  { key: "ts", header: "Data e ora", render: (e) => <span className="muted">{e.timestamp}</span> },
  { key: "interp", header: "Interpretazione", render: (e) => e.interpretation },
  { key: "band", header: "Confidenza", render: (e) => <BandPill band={e.confidenceBand} /> },
  { key: "feedback", header: "Feedback", render: (e) => <FeedbackBadge feedback={e.ownerFeedback} /> },
  { key: "status", header: "Stato", render: (e) => <StatusBadge status={e.status} /> },
];

export default function BehaviorTable({ events }: { events: BehaviorEvent[] }) {
  const router = useRouter(); const [status, setStatus] = useState<EventStatus | "tutti">("tutti"); const [band, setBand] = useState<ConfidenceBand | "tutte">("tutte"); const [feedback, setFeedback] = useState<FeedbackFilter>("tutti");
  const filtered = useMemo(() => events.filter((event) => (status === "tutti" || event.status === status) && (band === "tutte" || event.confidenceBand === band) && (feedback === "tutti" || (feedback === "senza" ? event.ownerFeedback === null : event.ownerFeedback === feedback))), [band, events, feedback, status]);
  return <><div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}><select className="input" aria-label="Filtra per stato" value={status} onChange={(e) => setStatus(e.target.value as EventStatus | "tutti")}><option value="tutti">Tutti gli stati</option><option value="completed">Completate</option><option value="processing">In corso</option><option value="failed">Fallite</option></select><select className="input" aria-label="Filtra per confidenza" value={band} onChange={(e) => setBand(e.target.value as ConfidenceBand | "tutte")}><option value="tutte">Tutte le confidenze</option><option value="HIGH">Alta</option><option value="MEDIUM">Media</option><option value="LOW">Bassa</option></select><select className="input" aria-label="Filtra per feedback" value={feedback} onChange={(e) => setFeedback(e.target.value as FeedbackFilter)}><option value="tutti">Tutti i feedback</option><option value="yes">Sì</option><option value="no">No</option><option value="senza">Senza</option></select></div><Card><div className="small muted" style={{ marginBottom: 10 }}>{filtered.length} eventi live</div><DataTable columns={columns} rows={filtered} onRowClick={(event) => router.push(`/behavior/${event.id}`)} emptyTitle="Nessun evento con questi filtri" /></Card></>;
}

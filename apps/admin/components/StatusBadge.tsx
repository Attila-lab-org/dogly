import type {
  ConfidenceBand,
  EventStatus,
  OwnerFeedback,
  Plan,
  ReportPriority,
  ReportStatus,
  ReportType,
  UserStatus,
} from "@/lib/types";

const BAND_CLASS: Record<ConfidenceBand, string> = {
  LOW: "pill-gray",
  MEDIUM: "pill-amber",
  HIGH: "pill-green",
};

const BAND_LABEL: Record<ConfidenceBand, string> = {
  LOW: "Bassa",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export function BandPill({ band }: { band: ConfidenceBand }) {
  return <span className={`pill ${BAND_CLASS[band]}`}>{BAND_LABEL[band]}</span>;
}

const STATUS_LABEL: Record<EventStatus, string> = {
  completed: "Completata",
  processing: "In corso",
  failed: "Fallita",
};

const STATUS_CLASS: Record<EventStatus, string> = {
  completed: "pill-green",
  processing: "pill-blue",
  failed: "pill-red",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`pill ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PlanBadge({ plan }: { plan: Plan }) {
  return plan === "premium" ? (
    <span className="pill pill-blue">Premium</span>
  ) : (
    <span className="pill pill-gray">Free</span>
  );
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, { cls: string; label: string }> = {
    active: { cls: "pill-green", label: "Attivo" },
    suspended: { cls: "pill-amber", label: "Sospeso" },
    deleted: { cls: "pill-red", label: "Eliminato" },
  };
  const { cls, label } = map[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function FeedbackBadge({ feedback }: { feedback: OwnerFeedback }) {
  if (feedback === "yes") return <span className="pill pill-green">Sì</span>;
  if (feedback === "no") return <span className="pill pill-red">No</span>;
  if (feedback === "unsure") return <span className="pill pill-gray">Non saprei</span>;
  return <span className="muted">—</span>;
}

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  interpretazione: "Interpretazione sbagliata",
  app: "Problema app",
  contenuto: "Contenuto",
  pagamento: "Pagamento",
};

const REPORT_TYPE_CLASS: Record<ReportType, string> = {
  interpretazione: "pill-blue",
  app: "pill-amber",
  contenuto: "pill-teal",
  pagamento: "pill-red",
};

export function ReportTypeBadge({ type }: { type: ReportType }) {
  return <span className={`pill ${REPORT_TYPE_CLASS[type]}`}>{REPORT_TYPE_LABEL[type]}</span>;
}

const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  da_leggere: "Da leggere",
  in_gestione: "In gestione",
  risolta: "Risolta",
};

const REPORT_STATUS_CLASS: Record<ReportStatus, string> = {
  da_leggere: "pill-amber",
  in_gestione: "pill-blue",
  risolta: "pill-green",
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`pill ${REPORT_STATUS_CLASS[status]}`}>{REPORT_STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: ReportPriority }) {
  return priority === "alta" ? (
    <span className="pill pill-red">Alta</span>
  ) : (
    <span className="pill pill-gray">Normale</span>
  );
}

export function AssigneeBadge({ assignee }: { assignee: string }) {
  if (assignee === "Non assegnata") return <span className="pill pill-gray">Non assegnata</span>;
  if (assignee === "Tu") return <span className="pill pill-teal">Tu</span>;
  return <span className="pill pill-blue">{assignee}</span>;
}

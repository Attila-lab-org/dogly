import { Inbox } from "lucide-react";

export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--muted)",
      }}
    >
      <Inbox size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
      <div style={{ fontWeight: 600, color: "var(--navy)" }}>{title}</div>
      {description && <div className="small" style={{ marginTop: 4 }}>{description}</div>}
    </div>
  );
}

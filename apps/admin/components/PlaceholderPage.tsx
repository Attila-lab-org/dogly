import type { LucideIcon } from "lucide-react";
import Card from "./Card";

// Pagina placeholder per le aree in arrivo nelle prossime versioni.
export default function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{description}</p>
      <Card>
        <div style={{ padding: "56px 24px", textAlign: "center" }}>
          <span
            style={{
              display: "inline-flex",
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "var(--primary-soft)",
              color: "var(--primary)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Icon size={30} />
          </span>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>In arrivo con la prossima versione</h2>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto" }}>
            {description}
          </p>
        </div>
      </Card>
    </div>
  );
}

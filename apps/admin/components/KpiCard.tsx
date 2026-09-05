import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import Sparkline from "./Sparkline";

export default function KpiCard({
  label,
  value,
  delta,
  deltaDirection,
  explanation,
  spark,
  icon,
}: {
  label: string;
  value: string;
  delta: string;
  deltaDirection: "up" | "down";
  explanation: string;
  spark: number[];
  icon: ReactNode;
}) {
  const positive = deltaDirection === "up";
  const deltaColor = positive ? "#15803d" : "#b91c1c";
  const DeltaIcon = positive ? TrendingUp : TrendingDown;
  return (
    <section className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "var(--primary-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary)",
            flex: "none",
          }}
        >
          {icon}
        </span>
        <span className="small" style={{ fontWeight: 700 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div
        className="small"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 6,
          color: deltaColor,
          fontWeight: 600,
        }}
      >
        <DeltaIcon size={14} />
        {delta}
      </div>
      <Sparkline data={spark} color={deltaColor} />
      <div className="small muted" style={{ marginTop: 6 }}>{explanation}</div>
    </section>
  );
}

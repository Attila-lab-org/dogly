"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyses7d } from "@/lib/data";

export function AnalysesChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={analyses7d} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gComportamento" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gDigestione" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5ebf3" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="comportamento"
          name="Comportamento"
          stroke="#2563eb"
          strokeWidth={2}
          fill="url(#gComportamento)"
        />
        <Area
          type="monotone"
          dataKey="digestione"
          name="Digestione"
          stroke="#14b8a6"
          strokeWidth={2}
          fill="url(#gDigestione)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

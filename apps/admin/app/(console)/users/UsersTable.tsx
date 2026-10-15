"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { PlanBadge, UserStatusBadge } from "@/components/StatusBadge";
import type { AdminUser } from "@/lib/types";

const columns: Column<AdminUser>[] = [
  { key: "name", header: "Nome", render: (u) => <div style={{ fontWeight: 600 }}>{u.name}</div> },
  { key: "email", header: "Email", render: (u) => <span className="mono muted">{u.emailMasked}</span> },
  { key: "plan", header: "Piano", render: (u) => <PlanBadge plan={u.plan} /> },
  { key: "dogs", header: "Cani", render: (u) => u.dogsCount },
  { key: "analyses", header: "Analisi", render: (u) => u.monthlyAnalyses },
  { key: "last", header: "Ultimo accesso", render: (u) => <span className="muted">{u.lastAccess}</span> },
  { key: "status", header: "Stato", render: (u) => <UserStatusBadge status={u.status} /> },
];

export default function UsersTable({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => `${u.name} ${u.emailMasked} ${u.id}`.toLowerCase().includes(q)) : users;
  }, [query, users]);
  return <><div style={{ position: "relative", maxWidth: 360, marginBottom: 14 }}><Search size={16} color="var(--muted-light)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} /><input className="input" style={{ paddingLeft: 36 }} placeholder="Cerca per nome, email o ID…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><DataTable columns={columns} rows={filtered} onRowClick={(u) => router.push(`/users/${u.id}`)} emptyTitle="Nessun utente trovato" /></>;
}

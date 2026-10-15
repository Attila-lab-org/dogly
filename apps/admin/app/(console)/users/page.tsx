import Card from "@/components/Card";
import UsersTable from "./UsersTable";
import { AdminDataUnavailableError, getAdminUsers } from "@/lib/admin-data";
import type { AdminUser } from "@/lib/types";

export default async function UsersPage() {
  let users: AdminUser[];
  try { users = await getAdminUsers(); } catch (error) {
    if (!(error instanceof AdminDataUnavailableError)) throw error;
    users = [];
  }
  return <div className="page"><h1 className="page-title">Utenti e Cani</h1><p className="page-subtitle">Account e utilizzo letti direttamente da Supabase.</p><Card>{users.length ? <UsersTable users={users} /> : <div className="muted">Dati utenti live non disponibili. Nessun dato demo viene mostrato.</div>}</Card></div>;
}

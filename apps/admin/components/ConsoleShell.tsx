import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { AdminSessionBadge } from "@/components/AdminSession";

export default function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <TopBar sessionSlot={<AdminSessionBadge />} />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}

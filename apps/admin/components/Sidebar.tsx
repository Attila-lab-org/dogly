"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronsLeft,
  ClipboardList,
  Flag,
  LayoutDashboard,
  Lock,
  PawPrint,
  ScrollText,
  Server,
  Wallet,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Panoramica", icon: LayoutDashboard },
  { href: "/segnalazioni", label: "Segnalazioni", icon: Flag },
  { href: "/users", label: "Utenti e Cani", icon: PawPrint },
  { href: "/behavior", label: "Comportamento", icon: Activity },
  { href: "/digestive", label: "Digestione", icon: ClipboardList },
  { href: "/costi", label: "Costi", icon: Wallet },
  { href: "/privacy", label: "Privacy", icon: Lock },
  { href: "/sistema", label: "Sistema", icon: Server },
  { href: "/audit", label: "Registro attività", icon: ScrollText },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 232,
        flex: "none",
        background: "var(--sidebar)",
        color: "#dbe6f5",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 18px 16px" }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Image src="/brand/dogly-logo-mark.png" alt="Dogly" width={26} height={26} />
        </span>
        <span>
          <strong style={{ display: "block", color: "#fff", fontSize: 15, letterSpacing: "0.08em" }}>
            DOGLY
          </strong>
          <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "#8fb0d8" }}>
            CONTROL CENTER
          </span>
        </span>
      </div>

      <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                margin: "2px 0",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? "#fff" : "#b7c9e2",
                background: active ? "var(--sidebar-active)" : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon size={17} strokeWidth={2} color={active ? "#2dd4bf" : "#8fb0d8"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          type="button"
          title="Demo V0 — non attivo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "9px 12px",
            border: "none",
            borderRadius: 10,
            background: "transparent",
            color: "#8fb0d8",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <ChevronsLeft size={17} />
          Riduci
        </button>
      </div>
    </aside>
  );
}

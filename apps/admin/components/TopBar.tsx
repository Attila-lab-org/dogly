"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bell, Dog, Flag, Search, User } from "lucide-react";
import { allDogs, behaviorEvents, reports, users } from "@/lib/data";

interface SearchResult {
  key: string;
  group: "Utenti" | "Cani" | "Eventi" | "Segnalazioni";
  title: string;
  subtitle: string;
  href: string;
}

const GROUP_ORDER: SearchResult["group"][] = ["Utenti", "Cani", "Eventi", "Segnalazioni"];
const MAX_PER_GROUP = 4;

const GROUP_ICONS: Record<SearchResult["group"], React.ReactNode> = {
  Utenti: <User size={15} color="var(--primary)" />,
  Cani: <Dog size={15} color="#0f766e" />,
  Eventi: <Activity size={15} color="#0f766e" />,
  Segnalazioni: <Flag size={15} color="#b45309" />,
};

function computeResults(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const foundUsers: SearchResult[] = users
    .filter((u) => u.name.toLowerCase().includes(q) || u.emailMasked.toLowerCase().includes(q))
    .map((u) => ({
      key: `u-${u.id}`,
      group: "Utenti",
      title: u.name,
      subtitle: u.emailMasked,
      href: `/users/${u.id}`,
    }));

  const foundDogs: SearchResult[] = allDogs
    .filter((d) => d.name.toLowerCase().includes(q) || d.breed.toLowerCase().includes(q))
    .map((d) => ({
      key: `d-${d.id}`,
      group: "Cani",
      title: `${d.name} — ${d.breed}`,
      subtitle: `di ${d.ownerName}`,
      href: `/users/${d.ownerId}`,
    }));

  const foundEvents: SearchResult[] = behaviorEvents
    .filter(
      (e) => e.id.toLowerCase().includes(q) || e.interpretation.toLowerCase().includes(q),
    )
    .map((e) => ({
      key: `e-${e.id}`,
      group: "Eventi",
      title: `${e.id} — ${e.interpretation}`,
      subtitle: `${e.dogName} · ${e.timestamp}`,
      href: `/behavior/${e.id}`,
    }));

  const foundReports: SearchResult[] = reports
    .filter((r) => r.id.toLowerCase().includes(q) || r.text.toLowerCase().includes(q))
    .map((r) => ({
      key: `r-${r.id}`,
      group: "Segnalazioni",
      title: `${r.id} — ${r.text}`,
      subtitle: r.userName,
      href: `/segnalazioni/${r.id}`,
    }));

  return [...foundUsers, ...foundDogs, ...foundEvents, ...foundReports];
}

export default function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce ~200ms
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  // Ctrl+K / Cmd+K per focalizzare la ricerca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click fuori → chiudi
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const results = useMemo(() => computeResults(debounced), [debounced]);
  const hasQuery = debounced.trim().length > 0;
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: results.filter((r) => r.group === group).slice(0, MAX_PER_GROUP),
  })).filter((g) => g.items.length > 0);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 28px",
        background: "#fff",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div ref={containerRef} style={{ position: "relative", flex: 1, maxWidth: 460 }}>
        <Search
          size={16}
          color="var(--muted-light)"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
        <input
          ref={inputRef}
          className="input"
          style={{ paddingLeft: 36, paddingRight: 52 }}
          placeholder="Cerca utente, cane, segnalazione…"
          aria-label="Ricerca globale"
          role="combobox"
          aria-expanded={open && hasQuery}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        <kbd
          aria-hidden
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            fontFamily: "inherit",
            color: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "2px 6px",
            background: "#f7fafd",
            pointerEvents: "none",
          }}
        >
          Ctrl K
        </kbd>

        {open && hasQuery && (
          <div className="search-results" role="listbox" aria-label="Risultati ricerca">
            {grouped.length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: 13 }} className="muted">
                Nessun risultato per &ldquo;{debounced.trim()}&rdquo;
              </div>
            )}
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="search-group-title">{group}</div>
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="search-item"
                    onClick={() => go(item.href)}
                  >
                    <span style={{ flex: "none" }}>{GROUP_ICONS[item.group]}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title}
                      </span>
                      <span className="small muted" style={{ display: "block" }}>{item.subtitle}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
        <span className="pill pill-green">
          <span className="dot" style={{ background: "var(--green)" }} />
          PRODUZIONE
        </span>

        <button
          type="button"
          aria-label="Notifiche (3 non lette)"
          style={{
            position: "relative",
            border: "1px solid var(--border)",
            background: "#fff",
            borderRadius: 10,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={17} color="var(--navy)" />
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "var(--red)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 17,
              height: 17,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            3
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "var(--primary)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            A
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Admin</span>
        </div>
      </div>
    </header>
  );
}

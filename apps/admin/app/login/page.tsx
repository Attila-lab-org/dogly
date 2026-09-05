"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: "min(400px, 100%)", padding: "36px 32px", textAlign: "center" }}>
        <span
          style={{
            display: "inline-flex",
            width: 72,
            height: 72,
            borderRadius: 22,
            background: "#fff",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Image src="/brand/dogly-logo-mark.svg" alt="Dogly" width={58} height={42} priority />
        </span>
        <h1 style={{ fontSize: 24, letterSpacing: "0.1em", marginBottom: 4 }}>DOGLY</h1>
        <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
          Il tuo cane, finalmente capito.
        </p>
        <p className="small muted" style={{ margin: "0 0 22px", letterSpacing: "0.12em", fontWeight: 600 }}>
          CONTROL CENTER
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/");
          }}
          style={{ display: "grid", gap: 12, textAlign: "left" }}
        >
          <label className="small" style={{ fontWeight: 600 }}>
            Email
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.cognome@dogly.it"
              style={{ marginTop: 5 }}
            />
          </label>
          <label className="small" style={{ fontWeight: 600 }}>
            Password
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ marginTop: 5 }}
            />
          </label>
          <button className="btn btn-primary" type="submit" style={{ justifyContent: "center", padding: "11px 14px" }}>
            Accedi
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 20, marginBottom: 0 }}>
          Accesso riservato al team — V0 demo
        </p>
      </div>
    </main>
  );
}

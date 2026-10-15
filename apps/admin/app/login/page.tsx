"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const notAllowed = searchParams.get("error") === "not_allowed";
  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

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
      <div
        className="card"
        style={{ width: "min(400px, 100%)", padding: "36px 32px", textAlign: "center" }}
      >
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
        <p
          className="small muted"
          style={{ margin: "0 0 22px", letterSpacing: "0.12em", fontWeight: 600 }}
        >
          CONTROL CENTER · ACCESSO SICURO
        </p>

        {!configured ? (
          <p className="small" style={{ margin: "0 0 18px", color: "#92400E", textAlign: "left" }}>
            Configura su Vercel (o in <code>.env.local</code>):{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> e{" "}
            <code>ADMIN_ALLOWED_EMAILS</code>. Poi crea l’utente in Supabase Auth.
          </p>
        ) : (
          <p className="small muted" style={{ margin: "0 0 18px", textAlign: "left" }}>
            Accedi con l’account Supabase autorizzato. Solo le email in allowlist
            entrano nella console.
          </p>
        )}

        {(state.error || notAllowed) && (
          <p role="alert" className="small" style={{ margin: "0 0 12px", color: "#B91C1C" }}>
            {state.error ||
              "Questo account non è autorizzato. Contatta un Owner del team."}
          </p>
        )}

        <form action={formAction} style={{ display: "grid", gap: 12, textAlign: "left" }}>
          <label className="small" style={{ fontWeight: 600 }}>
            Email
            <input
              className="input"
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder="nome.cognome@dogly.it"
              disabled={!configured || pending}
              style={{ marginTop: 5 }}
            />
          </label>
          <label className="small" style={{ fontWeight: 600 }}>
            Password
            <input
              className="input"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={!configured || pending}
              style={{ marginTop: 5 }}
            />
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!configured || pending}
            style={{ justifyContent: "center", padding: "11px 14px" }}
          >
            {pending ? "Accesso…" : "Accedi"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 20, marginBottom: 0 }}>
          Accesso riservato al team Dogly
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh" }} />}>
      <LoginForm />
    </Suspense>
  );
}

import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function AdminSessionBadge() {
  if (!isSupabaseConfigured()) {
    return (
      <span className="pill" style={{ background: "#FEE2E2", color: "#991B1B" }}>
        Auth non configurata
      </span>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "Admin";
  const initial = email.charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="pill" style={{ background: "#DCFCE7", color: "#166534" }}>
        <span className="dot" style={{ background: "#16A34A" }} />
        Autenticato
      </span>
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
          aria-hidden
        >
          {initial}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 160 }} title={email}>
          {email}
        </span>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="btn"
          style={{ padding: "8px 12px", fontSize: 12 }}
        >
          Esci
        </button>
      </form>
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAdminEmailAllowed,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

export type LoginState = {
  error: string | null;
};

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Autenticazione non configurata. Imposta NEXT_PUBLIC_SUPABASE_URL, la publishable key e ADMIN_ALLOWED_EMAILS.",
    };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Inserisci email e password." };
  }

  if (!isAdminEmailAllowed(email)) {
    return {
      error:
        "Questo account non è autorizzato al Control Center. Chiedi a un Owner di aggiungerlo in ADMIN_ALLOWED_EMAILS.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Email o password non corrette."
          : error.message,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmailAllowed(user.email)) {
    await supabase.auth.signOut();
    return { error: "Accesso negato: account non in allowlist admin." };
  }

  redirect("/");
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

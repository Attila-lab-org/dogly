import { NextResponse } from "next/server";
import { AdminDataUnavailableError, searchAdmin } from "@/lib/admin-data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ results: await searchAdmin(query) });
  } catch (error) {
    const status = error instanceof AdminDataUnavailableError ? 503 : 500;
    return NextResponse.json({ results: [], error: "Ricerca non disponibile" }, { status });
  }
}

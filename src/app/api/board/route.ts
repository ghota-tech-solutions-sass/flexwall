import { NextResponse } from "next/server";
import { rankEntries } from "@/lib/board";
import { listEntries } from "@/lib/store/entries";

export const dynamic = "force-dynamic";

/** GET /api/board — le registre classé, pour le polling client. */
export async function GET() {
  try {
    const entries = await listEntries();
    return NextResponse.json({ entries: rankEntries(entries) });
  } catch (error) {
    console.error("board api failed:", error);
    return NextResponse.json({ entries: [] }, { status: 500 });
  }
}

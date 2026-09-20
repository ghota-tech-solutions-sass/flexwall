import { NextResponse } from "next/server";
import { officialStripeStats } from "@/infrastructure/billing/official-stripe";
let cached: { until: number; value: Awaited<ReturnType<typeof officialStripeStats>> } | undefined;
let pending: ReturnType<typeof officialStripeStats> | undefined;
/** Public aggregate statistics explicitly published for Flexwall's official wall. No credentials or customer data. */
export async function GET() {
  try {
    if (!cached || cached.until <= Date.now()) {
      pending ??= officialStripeStats().finally(() => { pending = undefined; });
      cached = { value: await pending, until: Date.now() + 1_800_000 };
    }
    return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch {
    return NextResponse.json({ error: "Official Stripe statistics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

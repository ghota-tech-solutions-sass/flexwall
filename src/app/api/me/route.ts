import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rankEntries } from "@/lib/board";
import { eventsForSlug, findEntryByEmail, listEntries } from "@/lib/store/entries";
import { createMagicToken, MAGIC_LINK_TTL_MS, SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { emailEnabled, getEmailSender } from "@/lib/email";
import { seatLinkMail } from "@/lib/mail-templates";
import { publicOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

async function seatPayload(slug: string) {
  const all = await listEntries();
  const ranked = rankEntries(all);
  const entry = ranked.find((e) => e.slug === slug);
  if (!entry) return { found: false as const };
  const rank = ranked.findIndex((e) => e.slug === slug) + 1;
  const above = rank > 1 ? ranked[rank - 2] : null;
  const events = await eventsForSlug(slug);
  return {
    found: true as const,
    seat: {
      slug: entry.slug,
      name: entry.name,
      amountUSD: entry.amountUSD,
      createdAt: entry.createdAt,
      rank,
      total: ranked.length,
      toPassAbove: above
        ? { name: above.name, neededUSD: above.amountUSD - entry.amountUSD + 1 }
        : null,
    },
    payments: events.map((e) => ({ type: e.type, amountUSD: e.amountUSD, ts: e.ts })),
  };
}

/** GET /api/me — session cookie (émis au retour du checkout). */
export async function GET(req: NextRequest) {
  const slug = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!slug) return NextResponse.json({ found: false, reason: "no_session" }, { status: 401 });
  return NextResponse.json(await seatPayload(slug));
}

// ── Magic link par email : rate-limité (10/h/IP). La réponse est la même
//    qu'un email ait une place ou non : on n'est pas un oracle "a payé ?".

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  buckets.set(ip, arr);
  if (buckets.size > 10_000) buckets.clear(); // garde-fou mémoire
  return arr.length > MAX_PER_WINDOW;
}

const BodySchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  // Cloud Run appends the real client IP at the END of X-Forwarded-For; the
  // first hop is client-controlled and would let anyone dodge the limit.
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const ip = hops[hops.length - 1] || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ found: false, error: "too_many_attempts" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 422 });
  }

  if (!emailEnabled()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const entry = await findEntryByEmail(parsed.data.email);
  if (entry?.payerEmail) {
    const link = `${publicOrigin(req)}/me/link?token=${createMagicToken(entry.slug, MAGIC_LINK_TTL_MS)}`;
    try {
      await getEmailSender()?.(seatLinkMail(entry.payerEmail, entry.name, link));
    } catch (error) {
      console.error("seat link mail failed:", error);
    }
  }
  // Same answer either way.
  return NextResponse.json({ sent: true });
}


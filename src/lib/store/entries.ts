import { FieldValue, Firestore } from "@google-cloud/firestore";
import type { Entry } from "@/lib/board";
import { optionalEnv } from "@/lib/env";

/** Public projection of an entry: never carries the payer email. */
export type PublicEntry = Omit<Entry, "payerEmail">;

function toPublic(e: Entry): PublicEntry {
  // Destructure to drop payerEmail. Keep this the only place entries leave the store.
  const { payerEmail: _private, ...rest } = e;
  void _private;
  return rest;
}

/**
 * Store du registre.
 *  - entries/{slug}      : la place (montant cumulé, nom, email payeur privé)
 *  - events (collection) : le journal des mouvements (entrées et top-ups)
 *
 * Production : Firestore via le service account Cloud Run.
 * Sans credentials : mémoire seedée pour la démo locale.
 */

const COLLECTION = "entries";
const EVENTS = "events";
const PROJECT_ID = optionalEnv("GOOGLE_PROJECT_ID");

export interface WallEvent {
  id: string;
  type: "entry" | "topup";
  slug: string;
  name: string;
  amountUSD: number;
  newTotalUSD: number;
  ts: number;
}

let _db: Firestore | null = null;
let _firestoreBroken = false;

function getDb(): Firestore | null {
  if (_firestoreBroken || !PROJECT_ID) return null;
  if (!_db) {
    try {
      _db = new Firestore({ projectId: PROJECT_ID });
    } catch {
      _firestoreBroken = true;
      return null;
    }
  }
  return _db;
}

// ── Fallback mémoire (démo) ─────────────────────────────────────────

const memory = new Map<string, Entry>();
const memoryEvents: WallEvent[] = [];

function seedDemo() {
  if (memory.size > 0) return;
  const now = Date.now();
  // [slug, name, amount, verified, hoursAgo, views]
  const rows: [string, string, number, boolean, number, number][] = [
    ["quietmoney", "quietmoney", 14_200_000, true, 30, 412],
    ["vc_vampire", "VC Vampire", 9_800_000, false, 28, 233],
    ["crypto_karen", "crypto.karen", 4_150_000, false, 26, 187],
    ["trustfund_tom", "Trust Fund Tom", 2_700_000, true, 22, 95],
    ["saas_andy", "SaaS Andy", 1_200_500, false, 20, 78],
    ["nft_requiem", "NFT Requiem", 890_000, false, 18, 61],
    ["hedge_bae", "hedge_bae", 310_000, true, 14, 54],
    ["landlord_linda", "Landlord Linda", 52_000, false, 7, 23],
    ["salaire_minimum_max", "Salaire Minimum Max", 1_001, false, 3, 9],
  ];
  for (const [slug, name, amountUSD, verified, hoursAgo, views] of rows) {
    memory.set(slug, {
      slug,
      name,
      amountUSD,
      verified,
      createdAt: now - hoursAgo * 3_600_000,
      updatedAt: now - hoursAgo * 3_600_000,
      views,
    });
  }
}

// ── API publique ────────────────────────────────────────────────────

export async function listEntries(): Promise<PublicEntry[]> {
  const db = getDb();
  if (!db) {
    seedDemo();
    return [...memory.values()].map(toPublic);
  }
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map((d) => toPublic(d.data() as Entry));
}

const seenEventIds = new Set<string>();

/**
 * Crédite un slug et journalise le mouvement. Retourne l'événement créé,
 * ou null si `eventId` a déjà été traité (Stripe rejoue les webhooks :
 * le crédit doit être idempotent par événement, pas par livraison).
 */
export async function creditEntry(
  slug: string,
  displayName: string,
  amountUSD: number,
  payerEmail: string | undefined,
  eventId: string
): Promise<WallEvent | null> {
  let isNew = true;
  let newTotal = amountUSD;
  const now = Date.now();

  const db = getDb();
  if (!db) {
    seedDemo();
    if (seenEventIds.has(eventId)) return null;
    seenEventIds.add(eventId);
    const existing = memory.get(slug);
    if (existing) {
      isNew = false;
      existing.amountUSD += amountUSD;
      existing.updatedAt = now;
      newTotal = existing.amountUSD;
    } else {
      memory.set(slug, {
        slug,
        name: displayName,
        amountUSD,
        verified: false,
        createdAt: now,
        updatedAt: now,
        payerEmail: payerEmail?.toLowerCase(),
      });
    }
  } else {
    let duplicate = false;
    await db.runTransaction(async (tx) => {
      const eventRef = db.collection(EVENTS).doc(eventId);
      const seen = await tx.get(eventRef);
      if (seen.exists) {
        duplicate = true;
        return;
      }
      const ref = db.collection(COLLECTION).doc(slug);
      const doc = await tx.get(ref);
      if (doc.exists) {
        isNew = false;
        const prev = (doc.data() as Entry).amountUSD;
        newTotal = prev + amountUSD;
        tx.update(ref, { amountUSD: FieldValue.increment(amountUSD), updatedAt: now });
      } else {
        newTotal = amountUSD;
        tx.set(ref, {
          slug,
          name: displayName,
          amountUSD,
          verified: false,
          createdAt: now,
          updatedAt: now,
          ...(payerEmail ? { payerEmail: payerEmail.toLowerCase() } : {}),
        });
      }
      // Journal écrit dans la même transaction : un replay du webhook
      // retrouve le doc et ne crédite pas deux fois.
      tx.set(eventRef, {
        id: eventId,
        type: isNew ? "entry" : "topup",
        slug,
        name: displayName,
        amountUSD,
        newTotalUSD: newTotal,
        ts: now,
      } satisfies WallEvent);
    });
    if (duplicate) return null;
    return {
      id: eventId,
      type: isNew ? "entry" : "topup",
      slug,
      name: displayName,
      amountUSD,
      newTotalUSD: newTotal,
      ts: now,
    };
  }

  const event: WallEvent = {
    id: eventId,
    type: isNew ? "entry" : "topup",
    slug,
    name: displayName,
    amountUSD,
    newTotalUSD: newTotal,
    ts: now,
  };
  memoryEvents.unshift(event);
  if (memoryEvents.length > 50) memoryEvents.pop();
  return event;
}

export async function listEvents(limit = 12): Promise<WallEvent[]> {
  const db = getDb();
  if (!db) {
    seedDemo();
    return memoryEvents.slice(0, limit);
  }
  const snap = await db.collection(EVENTS).orderBy("ts", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as WallEvent);
}

/** Retrouve une place par l'email utilisé au paiement (lookup type suivi de commande). */
export async function findEntryByEmail(email: string): Promise<Entry | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  const db = getDb();
  if (!db) {
    seedDemo();
    for (const e of memory.values()) {
      if ((e.payerEmail ?? "").toLowerCase() === normalized) return e;
    }
    return null;
  }
  const snap = await db
    .collection(COLLECTION)
    .where("payerEmail", "==", normalized)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as Entry);
}

/** Tous les mouvements d'un slug (entrée + top-ups), du plus récent au plus ancien. */
export async function eventsForSlug(slug: string): Promise<WallEvent[]> {
  const db = getDb();
  if (!db) {
    seedDemo();
    return memoryEvents.filter((e) => e.slug === slug);
  }
  const snap = await db.collection(EVENTS).where("slug", "==", slug).limit(200).get();
  return snap.docs
    .map((d) => d.data() as WallEvent)
    .sort((a, b) => b.ts - a.ts);
}

/** Email du payeur d'une place — PRIVÉ, réservé aux notifications serveur. */
export async function payerEmailFor(slug: string): Promise<string | null> {
  const db = getDb();
  if (!db) {
    seedDemo();
    return memory.get(slug)?.payerEmail ?? null;
  }
  const doc = await db.collection(COLLECTION).doc(slug).get();
  if (!doc.exists) return null;
  return (doc.data() as Entry).payerEmail ?? null;
}

/**
 * Compte une vue publique de la place (page share). Best-effort : jamais
 * d'erreur remontée, un compteur de vanité ne vaut pas un 500.
 */
export async function recordSeatView(slug: string): Promise<void> {
  const db = getDb();
  if (!db) {
    seedDemo();
    const e = memory.get(slug);
    if (e) e.views = (e.views ?? 0) + 1;
    return;
  }
  try {
    await db.collection(COLLECTION).doc(slug).update({ views: FieldValue.increment(1) });
  } catch {
    /* doc absent ou transient : on ignore */
  }
}

/** Tests / reset démo. */
export function resetMemoryStore(): void {
  memory.clear();
  memoryEvents.length = 0;
}

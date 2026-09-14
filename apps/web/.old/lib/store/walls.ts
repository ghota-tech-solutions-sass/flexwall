import { FieldPath, FieldValue, Firestore } from "@google-cloud/firestore";
import type { WallConfig } from "@/lib/config";
import type { Values } from "@/lib/connectors/types";
import { optionalEnv } from "@/lib/env";
import { newId, newNonce } from "@/lib/tokens";

/**
 * Wallpapers and the payments that unlocked them.
 *  - fw_wallpapers/{id}   the config, Pro flag, key nonces, owner email (private)
 *  - fw_payments/{event}  one doc per Stripe event: replays unlock nothing twice
 *
 * The `fw_` prefix matters: this app shares the GCP project, and so the
 * default Firestore database, with the old leaderboard (`entries`, `events`).
 *
 * Without GOOGLE_PROJECT_ID the store lives in process memory, on globalThis so
 * every route bundle of the same server sees the same walls.
 */

/** Credentials for one connector, saved once and referenced by metrics through `id`. */
export interface StoredConnection {
  id: string;
  source: string;
  label: string;
  /** Non-secret details shown to the owner. */
  public: Record<string, string>;
  /** encryptJson() of the secret fields. Never leaves the server. */
  sealed: string;
  createdAt: number;
}

/** Last values fetched for one cache key, kept on the wall so a cold instance doesn't refetch. */
export interface CachedValues {
  at: number;
  values: Values;
}

export interface Wall {
  id: string;
  config: WallConfig;
  pro: boolean;
  /** Listed on /wall. Only honoured for Pro walls. */
  public: boolean;
  imgNonce: string;
  editNonce: string;
  email?: string;
  createdAt: number;
  updatedAt: number;
  proAt?: number;
  lastRenderAt?: number;
  renders?: number;
  connections?: Record<string, StoredConnection>;
  valueCache?: Record<string, CachedValues>;
}

const WALLS = "fw_wallpapers";
const PAYMENTS = "fw_payments";

let _db: Firestore | null | undefined;

function db(): Firestore | null {
  if (_db !== undefined) return _db;
  const projectId = optionalEnv("GOOGLE_PROJECT_ID");
  _db = projectId ? new Firestore({ projectId, ignoreUndefinedProperties: true }) : null;
  return _db;
}

const g = globalThis as unknown as { __fwWalls?: Map<string, Wall>; __fwPayments?: Set<string> };
const memory = (g.__fwWalls ??= new Map());
const memoryPayments = (g.__fwPayments ??= new Set());

export async function createWall(config: WallConfig): Promise<Wall> {
  const now = Date.now();
  const wall: Wall = {
    id: newId(),
    config,
    pro: false,
    public: false,
    imgNonce: newNonce(),
    editNonce: newNonce(),
    createdAt: now,
    updatedAt: now,
  };
  const d = db();
  if (!d) memory.set(wall.id, structuredClone(wall));
  // create() fails on an existing id instead of overwriting someone's wall.
  else await d.collection(WALLS).doc(wall.id).create(wall);
  return wall;
}

export async function getWall(id: string): Promise<Wall | null> {
  if (!/^[a-z0-9]{6,20}$/.test(id)) return null;
  const d = db();
  if (!d) return structuredClone(memory.get(id) ?? null);
  const snap = await d.collection(WALLS).doc(id).get();
  return snap.exists ? (snap.data() as Wall) : null;
}

type WallPatch = Partial<Pick<Wall, "config" | "public" | "imgNonce">>;

export async function updateWall(id: string, patch: WallPatch): Promise<Wall | null> {
  const updatedAt = Date.now();
  const d = db();
  if (!d) {
    const w = memory.get(id);
    if (!w) return null;
    Object.assign(w, structuredClone(patch), { updatedAt });
    return structuredClone(w);
  }
  const ref = d.collection(WALLS).doc(id);
  try {
    await ref.update({ ...patch, updatedAt });
  } catch (error) {
    if ((error as { code?: number }).code === 5) return null; // NOT_FOUND
    throw error;
  }
  return getWall(id);
}

/**
 * Unlocks Pro for a wall, once per payment event. Returns false for a replayed
 * event or an unknown wall — callers only send the receipt mail on true.
 */
export async function markPro(id: string, eventId: string, email?: string): Promise<boolean> {
  const now = Date.now();
  const d = db();
  if (!d) {
    const w = memory.get(id);
    if (!w || memoryPayments.has(eventId)) return false;
    memoryPayments.add(eventId);
    const first = !w.pro;
    Object.assign(w, { pro: true, proAt: w.proAt ?? now, updatedAt: now }, email ? { email: email.toLowerCase() } : {});
    return first;
  }
  return d.runTransaction(async (tx) => {
    const payRef = d.collection(PAYMENTS).doc(eventId);
    const wallRef = d.collection(WALLS).doc(id);
    const [pay, wall] = await Promise.all([tx.get(payRef), tx.get(wallRef)]);
    if (pay.exists || !wall.exists) return false;
    const w = wall.data() as Wall;
    tx.set(payRef, { eventId, wallId: id, at: now });
    tx.update(wallRef, { pro: true, proAt: w.proAt ?? now, updatedAt: now, ...(email ? { email: email.toLowerCase() } : {}) });
    // A second payment for an already-Pro wall is recorded but isn't news.
    return !w.pro;
  });
}

export async function listPublicWalls(limit = 60): Promise<Wall[]> {
  const d = db();
  if (!d) {
    return [...memory.values()]
      .filter((w) => w.pro && w.public)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((w) => structuredClone(w));
  }
  const snap = await d.collection(WALLS).where("public", "==", true).where("pro", "==", true).limit(200).get();
  return snap.docs
    .map((doc) => doc.data() as Wall)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** Keeps a daily-ish heartbeat of Shortcut fetches without a write per request. */
export async function noteRender(wall: Wall): Promise<void> {
  const now = Date.now();
  if (wall.lastRenderAt && now - wall.lastRenderAt < 60 * 60 * 1000) return;
  const renders = (wall.renders ?? 0) + 1;
  const d = db();
  if (!d) {
    const w = memory.get(wall.id);
    if (w) Object.assign(w, { lastRenderAt: now, renders });
    return;
  }
  await d.collection(WALLS).doc(wall.id).update({ lastRenderAt: now, renders });
}

export async function saveConnection(id: string, conn: StoredConnection): Promise<void> {
  const d = db();
  if (!d) {
    const w = memory.get(id);
    if (w) w.connections = { ...w.connections, [conn.id]: structuredClone(conn) };
    return;
  }
  await d.collection(WALLS).doc(id).update(new FieldPath("connections", conn.id), conn, "updatedAt", Date.now());
}

/** Removes a connection and every cached value fetched through it. */
export async function deleteConnection(id: string, connId: string, cacheKeys: string[]): Promise<void> {
  const d = db();
  if (!d) {
    const w = memory.get(id);
    if (!w) return;
    delete w.connections?.[connId];
    for (const k of cacheKeys) delete w.valueCache?.[k];
    return;
  }
  const args: unknown[] = [new FieldPath("connections", connId), FieldValue.delete()];
  for (const k of cacheKeys) args.push(new FieldPath("valueCache", k), FieldValue.delete());
  args.push("updatedAt", Date.now());
  const [first, firstValue, ...rest] = args;
  await d.collection(WALLS).doc(id).update(first as FieldPath, firstValue, ...rest);
}

export async function saveCachedValues(id: string, key: string, entry: CachedValues): Promise<void> {
  const d = db();
  if (!d) {
    const w = memory.get(id);
    if (w) w.valueCache = { ...w.valueCache, [key]: structuredClone(entry) };
    return;
  }
  await d.collection(WALLS).doc(id).update(new FieldPath("valueCache", key), entry);
}

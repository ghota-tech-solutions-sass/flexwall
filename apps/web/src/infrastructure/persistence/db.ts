import { Firestore } from "@google-cloud/firestore";
import { optionalEnv } from "@/infrastructure/env";

/**
 * The smallest document store the app needs, over Firestore in production
 * and process memory locally (no GOOGLE_PROJECT_ID). Stores in
 * `server/store/*` are written against this, so both paths run the same code.
 *
 * Patches are shallow: nested objects are replaced whole. Keeps both
 * implementations honest and avoids Firestore's dotted-path surprises.
 */

export type Doc = Record<string, unknown>;

export interface Tx {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  set(collection: string, id: string, data: Doc): void;
  delete(collection: string, id: string): void;
}

export interface Db {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  set(collection: string, id: string, data: Doc): Promise<void>;
  /** False when the document already exists: nothing is written. */
  create(collection: string, id: string, data: Doc): Promise<boolean>;
  /** False when the document doesn't exist. */
  update(collection: string, id: string, patch: Doc): Promise<boolean>;
  delete(collection: string, id: string): Promise<void>;
  where<T extends Doc>(collection: string, filters: [field: string, value: unknown][], limit?: number): Promise<T[]>;
  count(collection: string, filters?: [field: string, value: unknown][]): Promise<number>;
  /** Reads then writes atomically. Writes are applied only if `fn` resolves. */
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

const PREFIX = "fw_";

function firestoreDb(projectId: string): Db {
  const fs = new Firestore({ projectId, ignoreUndefinedProperties: true });
  const ref = (c: string, id: string) => fs.collection(PREFIX + c).doc(id);
  return {
    async get(c, id) {
      const snap = await ref(c, id).get();
      return snap.exists ? (snap.data() as never) : null;
    },
    async set(c, id, data) {
      await ref(c, id).set(data);
    },
    async create(c, id, data) {
      try {
        await ref(c, id).create(data);
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === 6) return false; // ALREADY_EXISTS
        throw error;
      }
    },
    async update(c, id, patch) {
      try {
        await ref(c, id).update(patch);
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === 5) return false; // NOT_FOUND
        throw error;
      }
    },
    async delete(c, id) {
      await ref(c, id).delete();
    },
    async where(c, filters, limit = 500) {
      let q: FirebaseFirestore.Query = fs.collection(PREFIX + c);
      for (const [field, value] of filters) q = q.where(field, "==", value);
      const snap = await q.limit(limit).get();
      return snap.docs.map((d) => d.data() as never);
    },
    async count(c, filters = []) {
      let q: FirebaseFirestore.Query = fs.collection(PREFIX + c);
      for (const [field, value] of filters) q = q.where(field, "==", value);
      return (await q.count().get()).data().count;
    },
    transaction(fn) {
      return fs.runTransaction(async (t) =>
        fn({
          async get(c, id) {
            const snap = await t.get(ref(c, id));
            return snap.exists ? (snap.data() as never) : null;
          },
          set: (c, id, data) => void t.set(ref(c, id), data),
          delete: (c, id) => void t.delete(ref(c, id)),
        })
      );
    },
  };
}

function memoryDb(): Db {
  // On globalThis: Next bundles each route separately, and they must share one store.
  const g = globalThis as unknown as { __flexwallDb?: Map<string, Map<string, Doc>> };
  const data = (g.__flexwallDb ??= new Map());
  const col = (c: string) => {
    if (!data.has(c)) data.set(c, new Map());
    return data.get(c)!;
  };
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  let queue = Promise.resolve();
  return {
    get: async (c, id) => clone((col(c).get(id) as never) ?? null),
    set: async (c, id, doc) => void col(c).set(id, clone(doc)),
    async create(c, id, doc) {
      if (col(c).has(id)) return false;
      col(c).set(id, clone(doc));
      return true;
    },
    async update(c, id, patch) {
      const cur = col(c).get(id);
      if (!cur) return false;
      col(c).set(id, { ...cur, ...clone(patch) });
      return true;
    },
    delete: async (c, id) => void col(c).delete(id),
    async where(c, filters, limit = 500) {
      return [...col(c).values()].filter((d) => filters.every(([f, v]) => d[f] === v)).slice(0, limit).map(clone) as never;
    },
    async count(c, filters = []) {
      return [...col(c).values()].filter((d) => filters.every(([f, v]) => d[f] === v)).length;
    },
    transaction(fn) {
      // Serialize transactions so read-then-write is atomic in memory too.
      const run = queue.then(async () => {
        const writes: (() => void)[] = [];
        const result = await fn({
          get: async (c, id) => clone((col(c).get(id) as never) ?? null),
          set: (c, id, doc) => void writes.push(() => col(c).set(id, clone(doc))),
          delete: (c, id) => void writes.push(() => col(c).delete(id)),
        });
        writes.forEach((w) => w());
        return result;
      });
      queue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };
}

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    const projectId = optionalEnv("GOOGLE_PROJECT_ID");
    _db = projectId ? firestoreDb(projectId) : memoryDb();
  }
  return _db;
}

/** Tests only: start from an empty memory store. */
export function resetMemoryDb(): void {
  const g = globalThis as unknown as { __flexwallDb?: Map<string, Map<string, Doc>> };
  g.__flexwallDb?.clear();
  _db = null;
}

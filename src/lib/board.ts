export const MIN_ENTRY_USD = Number(process.env.MIN_ENTRY_USD ?? "1000");

export interface Entry {
  /** Clé d'identité normalisée (doc id Firestore, matching des top-ups). */
  slug: string;
  /** Nom affiché tel que saisi : @pseudo X, prénom nom, société, free text. */
  name: string;
  amountUSD: number;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
  /** Email du payeur (Stripe) — privé, jamais affiché. Sert au lookup /me. */
  payerEmail?: string;
  /** Vues publiques de la page share (compteur best-effort). */
  views?: number;
  /** Enrichissement identité (webhook) : avatar X stocké côté serveur… */
  avatarB64?: string;
  avatarType?: string;
  /** …et titre/description du site si le nom est une URL. Publics. */
  linkTitle?: string;
  linkDescription?: string;
}

/**
 * Plancher d'entrée dynamique : bas au lancement pour convertir l'impulsion,
 * il monte avec la taille du mur jusqu'au tarif d'exclusion ($1,000).
 */
export const FLOOR_TIERS: { at: number; floor: number }[] = [
  { at: 25, floor: 250 },
  { at: 50, floor: 500 },
  { at: 100, floor: 1000 },
];

export function dynamicFloor(count: number): number {
  let f = 100;
  for (const t of FLOOR_TIERS) if (count >= t.at) f = t.floor;
  return f;
}

export function nextFloorTier(count: number): { at: number; floor: number } | null {
  for (const t of FLOOR_TIERS) if (count < t.at) return t;
  return null;
}

/** Les 100 premières places (par date) portent l'étoile FOUNDER à vie. */
export function founderSlugs(entries: Pick<Entry, "slug" | "createdAt">[]): Set<string> {
  return new Set([...entries].sort((a, b) => a.createdAt - b.createdAt).slice(0, 100).map((e) => e.slug));
}

/**
 * Identité à partir du champ libre.
 * - name : la saisie nettoyée (affichée publiquement)
 * - slug : clé stable — minuscules, accents retirés, espaces/ponctuation → _
 *
 * "@Elonmusk", "elonmusk" et "ELON MUSK" pointent vers le même mur :
 * c'est volontaire, l'argent est le seul juge de paix.
 */
export function makeIdentity(raw: string): { name: string; slug: string } | null {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 2) return null;

  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritiques
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (slug.length < 2 || !/[a-z0-9]/.test(slug)) return null;
  return { name, slug: slug.slice(0, 30) };
}

/** Rank = amount desc ; ties go to whoever arrived first (createdAt asc). */
export function rankEntries<T extends Pick<Entry, "amountUSD" | "createdAt">>(entries: T[]): T[] {
  return entries.slice().sort((a, b) => b.amountUSD - a.amountUSD || a.createdAt - b.createdAt);
}

export function totalOnDisplay(entries: Pick<Entry, "amountUSD">[]): number {
  return entries.reduce((sum, e) => sum + e.amountUSD, 0);
}

export function formatUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function compactUSD(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "k";
  return formatUSD(n);
}

/** "founding price, rises to $250 in 12 entries" — null once every tier is passed. */
export function tierNote(count: number): string | null {
  const t = nextFloorTier(count);
  return t ? `founding price, rises to ${formatUSD(t.floor)} in ${t.at - count} entries` : null;
}

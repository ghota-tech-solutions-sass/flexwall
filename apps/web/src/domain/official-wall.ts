import type { Handle } from "./handle";
import { newWall, type Binding, type Tile } from "./wall";

/** Real, refreshable bindings only. This is not a sample wall. */
export function officialWall(ownerId: string, id: string, now: number, lockNonce: string) {
  const repo = "ghota-tech-solutions-sass/flexwall";
  const metric = (connector: string, name: string): Binding => ({ kind: "metric", connector, metric: name, params: connector === "github" ? { repo } : {}, connection: null, history: null });
  const tile = (id: string, widget: string, layout: Tile["layout"], options: Tile["options"], binding?: Binding): Tile => ({ id, widget, layout, options, inputs: binding ? { [widget === "bar-chart" ? "series" : "value"]: binding } : {}, visibility: "public" });
  const wall = newWall({ id, owner: { id: ownerId, handle: "flexwall" as Handle }, now, today: new Date(now).toISOString().slice(0, 10), lockNonce });
  return { ...wall, title: "Flexwall · Building in public", bio: "Our own wall. Our real numbers. Follow the product as it grows — then tell your own story.", theme: "midnight", published: true, listed: true,
    tiles: [
      tile("builders", "goal-ring", { x: 0, y: 0, w: 2, h: 2 }, { label: "Registered accounts", goal: 100, privacy: "exact" }, metric("flexwall", "accounts")),
      tile("intro", "note", { x: 2, y: 0, w: 2, h: 1 }, { title: "Every wall starts somewhere.", body: "A small product, built in the open. These numbers come straight from Flexwall and GitHub. No demo data." }),
      tile("sources", "stat", { x: 2, y: 1, w: 2, h: 1 }, { label: "Data connectors", privacy: "exact" }, metric("flexwall", "connectors")),
      tile("shipping", "bar-chart", { x: 0, y: 2, w: 4, h: 1 }, { label: "Commits · last 30 days (UTC)", summary: "sum", privacy: "exact" }, metric("github", "commits-daily")),
      tile("walls", "stat", { x: 0, y: 3, w: 2, h: 1 }, { label: "Walls created · includes drafts", privacy: "exact" }, metric("flexwall", "walls")),
      tile("stars", "stat", { x: 2, y: 3, w: 2, h: 1 }, { label: "GitHub stars", privacy: "exact" }, metric("github", "stars")),
      tile("create", "link", { x: 0, y: 4, w: 2, h: 1 }, { title: "Your story is next.", subtitle: "Create your free wall →", url: "https://flexwall.lol/login" }),
      tile("source", "link", { x: 2, y: 4, w: 2, h: 1 }, { title: "Built in the open.", subtitle: "Explore the source on GitHub →", url: `https://github.com/${repo}` }),
    ], lockscreen: { ...wall.lockscreen, placements: [{ tileId: "builders", box: { x: 0, y: 0, w: 2, h: 2 } }, { tileId: "sources", box: { x: 2, y: 0, w: 2, h: 1 } }] },
  };
}

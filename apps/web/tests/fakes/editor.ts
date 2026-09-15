import type { FieldValues } from "@flexwall/sdk";
import type { EditorGateway, Outcome, Resolution, Scheduler } from "@/application/editor/ports";
import type { ConnectionView } from "@/domain/connection";
import type { Tile, WallDraft } from "@/domain/wall";

/**
 * A scheduler that only moves when the test says so. `advance` runs what came
 * due and lets the promises it started settle, so a test reads top to bottom.
 */
export class ManualScheduler implements Scheduler {
  private now = 0;
  private tasks: { at: number; run: () => void }[] = [];

  schedule(ms: number, run: () => void) {
    const task = { at: this.now + ms, run };
    this.tasks.push(task);
    return () => {
      this.tasks = this.tasks.filter((t) => t !== task);
    };
  }

  get pending(): number {
    return this.tasks.length;
  }

  async advance(ms: number): Promise<void> {
    this.now += ms;
    const due = this.tasks.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at);
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const task of due) task.run();
    await settle();
  }
}

/** Lets every promise already started finish. */
export const settle = () => new Promise<void>((done) => setImmediate(done));

/** A gateway that records what the editor sends and answers what the test scripted. */
export class FakeEditorGateway implements EditorGateway {
  saved: WallDraft[] = [];
  resolved: (readonly Tile[])[] = [];
  removedAccounts: string[] = [];

  saveOutcome: Outcome<void> = { ok: true, value: undefined };
  resolution: (tiles: readonly Tile[]) => Resolution = () => ({ states: {}, today: "2026-09-15" });
  connectOutcome: (connector: string, values: FieldValues) => Outcome<ConnectionView> = (connector) => ({ ok: true, value: { id: `conn-${connector}`, connector, label: connector, public: {}, createdAt: 0 } });
  removeOutcome: Outcome<void> = { ok: true, value: undefined };
  lockscreenPath = "/l/wall/new-key";

  /** When set, saves wait until `releaseSaves` is called. */
  holdSaves = false;
  private held: (() => void)[] = [];

  async saveWall(draft: WallDraft): Promise<Outcome<void>> {
    this.saved.push(draft);
    if (this.holdSaves) await new Promise<void>((release) => this.held.push(release));
    return this.saveOutcome;
  }

  releaseSaves() {
    for (const release of this.held.splice(0)) release();
  }

  async resolveTiles(tiles: readonly Tile[]): Promise<Outcome<Resolution>> {
    this.resolved.push(tiles);
    return { ok: true, value: this.resolution(tiles) };
  }

  async connectAccount(connector: string, values: FieldValues): Promise<Outcome<ConnectionView>> {
    return this.connectOutcome(connector, values);
  }

  readonly signIns: { connector: string; values: FieldValues; returnTo: string }[] = [];
  signInOutcome: Outcome<string> = { ok: true, value: "https://provider.test/authorize?state=s" };

  async startSignIn(connector: string, values: FieldValues, returnTo: string): Promise<Outcome<string>> {
    this.signIns.push({ connector, values, returnTo });
    return this.signInOutcome;
  }

  async removeAccount(connectionId: string): Promise<Outcome<void>> {
    this.removedAccounts.push(connectionId);
    return this.removeOutcome;
  }

  readonly renamedAccounts: { connectionId: string; nickname: string | null }[] = [];
  /** Answers a rename; by default the server keeps the trimmed name. */
  renameOutcome: (connectionId: string, nickname: string | null) => Outcome<ConnectionView> = (connectionId, nickname) => ({
    ok: true,
    value: { id: connectionId, connector: "billing", label: "Billing account", public: {}, createdAt: 0, nickname: nickname?.trim() || null },
  });

  async renameAccount(connectionId: string, nickname: string | null): Promise<Outcome<ConnectionView>> {
    this.renamedAccounts.push({ connectionId, nickname });
    return this.renameOutcome(connectionId, nickname);
  }

  async rotateLockscreenLink(): Promise<Outcome<string>> {
    return { ok: true, value: this.lockscreenPath };
  }
}

/** Tile ids t1, t2, t3… */
export function sequentialIds(prefix = "t") {
  let n = 0;
  return () => `${prefix}${++n}`;
}

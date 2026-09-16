/**
 * What the phone editor shows over the wall. The two panels that sit beside the
 * canvas on a desktop can't be permanent on a phone: the wall would be a strip.
 * They become one sheet that rises when it's needed and gets out of the way
 * after — the inspector when a tile is selected, the library when adding, the
 * wall's own settings on demand.
 *
 * It is not part of the wall, so it never reaches the store: it's the shell's
 * own state, kept here as a pure transition table so it can be read and tested
 * without a browser.
 */

export type Sheet =
  | { kind: "none" }
  | { kind: "library" }
  /** "peek" leaves the selected tile visible above the sheet; "full" is for long forms. */
  | { kind: "inspector"; height: "peek" | "full" }
  | { kind: "wall" };

export type SheetEvent =
  /** A tile was selected. */
  | "select"
  /** Nothing is selected any more. */
  | "deselect"
  /** The owner asked to add a tile. */
  | "add"
  /** The owner asked for the wall's settings. */
  | "design"
  /** The owner pulled the sheet up. */
  | "expand"
  /** The owner closed the sheet, or tapped the wall behind it. */
  | "dismiss";

export const CLOSED: Sheet = { kind: "none" };

export function nextSheet(current: Sheet, event: SheetEvent): Sheet {
  switch (event) {
    case "select":
      // Selecting again while the sheet is already full keeps it full: the owner put it there.
      return current.kind === "inspector" ? current : { kind: "inspector", height: "peek" };
    case "deselect":
      return current.kind === "inspector" ? CLOSED : current;
    case "add":
      return { kind: "library" };
    case "design":
      return { kind: "wall" };
    case "expand":
      return current.kind === "inspector" ? { kind: "inspector", height: "full" } : current;
    case "dismiss":
      return CLOSED;
  }
}

/** Whether the wall behind the sheet should still be reachable by tapping it. */
export function isOpen(sheet: Sheet): boolean {
  return sheet.kind !== "none";
}

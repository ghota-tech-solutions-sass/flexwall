/**
 * The editor's keyboard shortcuts, defined once: the key handler reads them
 * and the Shortcuts panel lists them, so the two can't disagree.
 */

export type ShortcutAction = "delete" | "duplicate" | "undo" | "deselect" | "save";

export interface Shortcut {
  action: ShortcutAction;
  label: string;
  /** Keys as shown to the owner. */
  keys: readonly string[];
  matches(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">): boolean;
}

const withModifier = (event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">) => event.metaKey || event.ctrlKey;

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "delete", label: "Delete a selected tile", keys: ["Delete"], matches: (e) => e.key === "Delete" || e.key === "Backspace" },
  { action: "duplicate", label: "Duplicate it", keys: ["⌘", "D"], matches: (e) => withModifier(e) && e.key.toLowerCase() === "d" },
  { action: "undo", label: "Undo a delete", keys: ["⌘", "Z"], matches: (e) => withModifier(e) && !e.shiftKey && e.key.toLowerCase() === "z" },
  { action: "save", label: "Save now", keys: ["⌘", "S"], matches: (e) => withModifier(e) && e.key.toLowerCase() === "s" },
  { action: "deselect", label: "Back to the wall settings", keys: ["Esc"], matches: (e) => e.key === "Escape" },
];

/** Elements that take typing: shortcuts stay out of their way. */
const TEXT_ENTRY_TAGS: readonly string[] = ["INPUT", "TEXTAREA", "SELECT"];

export function isTypingInto(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TEXT_ENTRY_TAGS.includes(target.tagName) || target.isContentEditable);
}

export function shortcutFor(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">): ShortcutAction | null {
  return SHORTCUTS.find((s) => s.matches(event))?.action ?? null;
}

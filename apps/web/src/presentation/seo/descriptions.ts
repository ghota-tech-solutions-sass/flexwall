import { formatBand, formatValue, type NumberValue } from "@flexwall/sdk";

const MAX_DESCRIPTION = 200;

/** "Commit streak" reads "commit streak" mid-sentence; "MRR" stays "MRR". */
export function inSentence(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length > 1 && /^[A-Z][a-z]/.test(trimmed)) return trimmed[0]!.toLowerCase() + trimmed.slice(1);
  return trimmed;
}

/** Cuts at a word boundary and ends with an ellipsis when too long. */
export function clip(text: string, max = MAX_DESCRIPTION): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "") + "…";
}

/**
 * A wall's search snippet: its first public numbers, then its bio.
 * "Ada Builds on Flexwall: $4,820 MRR, 47 day streak. Indie hacker…"
 */
export function wallDescription(input: { handle: string; title: string; bio: string; numbers: readonly { label: string; value: NumberValue; range?: boolean }[] }): string {
  const name = input.title || `@${input.handle}`;
  const numbers = input.numbers
    .slice(0, 3)
    .map((n) => [n.range ? formatBand(n.value) : formatValue(n.value), inSentence(n.label)].filter(Boolean).join(" "))
    .join(", ");
  const lead = numbers ? `${name} on Flexwall: ${numbers}.` : "";
  const bio = input.bio.trim();
  if (!lead && !bio) return `Live numbers from @${input.handle} on Flexwall.`;
  return clip([lead, bio].filter(Boolean).join(" "));
}

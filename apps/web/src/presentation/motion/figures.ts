/**
 * A figure as a tile prints it ("$4,820", "47 days", "+127.5%", "12.4k"), split
 * so it can be counted up from zero and printed the same way at every frame.
 */
export interface Figure {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

const FIGURE = /^([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\D{0,12})$/;

/** Reads a figure out of a text, or null when the text isn't one number with short words around it. */
export function parseFigure(text: string): Figure | null {
  const match = FIGURE.exec(text.trim());
  if (!match) return null;
  const [, prefix, integer, fraction = "", suffix] = match;
  if (prefix.length > 3 || /\d/.test(suffix)) return null;
  const value = Number(integer.replace(/,/g, "") + fraction);
  if (!Number.isFinite(value)) return null;
  return { prefix, value, decimals: Math.max(0, fraction.length - 1), grouped: integer.includes(","), suffix };
}

/** Prints a value the way the original figure was printed. */
export function formatFigure(figure: Figure, value: number): string {
  const digits = value.toLocaleString("en-US", {
    minimumFractionDigits: figure.decimals,
    maximumFractionDigits: figure.decimals,
    useGrouping: figure.grouped,
  });
  return `${figure.prefix}${digits}${figure.suffix}`;
}

/** Fast start, soft landing: most of the count happens early, the last digits settle. */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

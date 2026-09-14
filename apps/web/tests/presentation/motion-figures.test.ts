import { describe, expect, test } from "bun:test";
import { easeOutExpo, formatFigure, parseFigure } from "@/presentation/motion/figures";

describe("Figures that count up", () => {
  test("given a currency figure with thousands, when parsed and printed halfway, then prefix and grouping are kept", () => {
    // Given
    const figure = parseFigure("$4,820")!;

    // When
    const halfway = formatFigure(figure, 2410);

    // Then
    expect(figure).toEqual({ prefix: "$", value: 4820, decimals: 0, grouped: true, suffix: "" });
    expect(halfway).toBe("$2,410");
  });

  test("given a signed percentage with a decimal, when printed at its final value, then it reads exactly as before", () => {
    // Given
    const figure = parseFigure("+127.5%")!;

    // When
    const final = formatFigure(figure, figure.value);

    // Then
    expect(final).toBe("+127.5%");
  });

  test("given a number followed by a short word, when parsed, then the word stays as a suffix", () => {
    // Given / When
    const figure = parseFigure("47 days")!;

    // Then
    expect(formatFigure(figure, 12)).toBe("12 days");
  });

  test("given a label, a date or two numbers, when parsed, then none of them is treated as a figure", () => {
    // Given / When / Then
    expect(parseFigure("Commit streak")).toBeNull();
    expect(parseFigure("1,887 in 52 weeks")).toBeNull();
    expect(parseFigure("Sep 14, 2026")).toBeNull();
  });

  test("given the easing, when time runs from start to end, then it starts at zero, rises fast and lands exactly on one", () => {
    // Given / When / Then
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(0.3)).toBeGreaterThan(0.8);
    expect(easeOutExpo(1)).toBe(1);
  });
});

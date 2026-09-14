import { describe, expect, test } from "bun:test";
import { parseSourceKey, sameSource, sourceKey, sourceOfBinding, type SourceRef } from "@/domain/source";

describe("Source references", () => {
  test("given every kind of source, when keyed and parsed back, then nothing is lost", () => {
    // Given
    const refs: SourceRef[] = [
      { kind: "static", type: "number" },
      { kind: "metric", connector: "stripe", metric: "mrr" },
      { kind: "history", connector: "stripe", metric: "mrr", window: "90d" },
    ];

    // When
    const roundTrip = refs.map((r) => parseSourceKey(sourceKey(r)));

    // Then
    expect(roundTrip).toEqual(refs);
  });

  test("given keys no source produces, when parsed, then they're refused instead of cast", () => {
    // Given
    const keys = ["", "static:series", "history:stripe:mrr:7d", "metric:stripe", "metric::mrr", "webhook:x:y"];

    // When
    const parsed = keys.map(parseSourceKey);

    // Then
    expect(parsed).toEqual([null, null, null, null, null, null]);
  });

  test("given a history binding, when its source is read, then it matches the source the editor offered", () => {
    // Given
    const binding = { kind: "metric" as const, connector: "stripe", metric: "mrr", params: {}, connection: null, history: "30d" as const };

    // When
    const source = sourceOfBinding(binding);

    // Then
    expect(sameSource(source, { kind: "history", connector: "stripe", metric: "mrr", window: "30d" })).toBe(true);
    expect(sameSource(source, { kind: "metric", connector: "stripe", metric: "mrr" })).toBe(false);
  });
});

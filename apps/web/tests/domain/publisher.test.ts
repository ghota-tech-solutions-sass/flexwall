import { describe, expect, test } from "bun:test";
import { isMediatorDesignated, missingPublisherMentions, PUBLISHER } from "@/domain/publisher";

describe("Publisher mentions", () => {
  test("given the published identity, when checked, then no mandatory mention is missing", () => {
    // Given
    const identity = PUBLISHER;

    // When
    const missing = missingPublisherMentions(identity);

    // Then
    expect(missing).toEqual([]);
  });

  test("given an identity without capital or VAT number, when checked, then both are reported in display order", () => {
    // Given
    const identity = { ...PUBLISHER, shareCapital: null, vatNumber: "  " };

    // When
    const missing = missingPublisherMentions(identity);

    // Then
    expect(missing).toEqual(["shareCapital", "vatNumber"]);
  });
});

describe("Consumer mediator", () => {
  test("given only a mediator's name, when checked, then it doesn't count as designated", () => {
    // Given
    const mediator = { name: "CNPM Médiation Consommation", website: null, postalAddress: null };

    // When
    const designated = isMediatorDesignated(mediator);

    // Then
    expect(designated).toBe(false);
  });

  test("given a name and a website, when checked, then consumers can reach them", () => {
    // Given
    const mediator = { name: "CNPM Médiation Consommation", website: "https://www.cnpm-mediation-consommation.eu", postalAddress: null };

    // When
    const designated = isMediatorDesignated(mediator);

    // Then
    expect(designated).toBe(true);
  });
});

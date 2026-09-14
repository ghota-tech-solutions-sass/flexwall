import { describe, expect, test } from "bun:test";
import { RouteLinks } from "@/presentation/links";

describe("App links", () => {
  test("given the app's origin with a trailing slash, when use cases ask for links, then they point at the app's routes on that origin", () => {
    // Given
    const links = new RouteLinks("https://flexwall.test/");

    // When
    const built = [links.signIn("magic:ada@example.com"), links.checkoutSucceeded(), links.checkoutCancelled(), links.billingReturn(), links.referral("ada")];

    // Then
    expect(built).toEqual([
      "https://flexwall.test/api/auth/verify?token=magic%3Aada%40example.com",
      "https://flexwall.test/settings?upgraded=1",
      "https://flexwall.test/pricing",
      "https://flexwall.test/settings",
      "https://flexwall.test/r/ada",
    ]);
  });

  test("given a wall and its key, when the lock screen link is built, then it stays relative so the editor can put its own origin in front", () => {
    // Given
    const links = new RouteLinks("https://flexwall.test");

    // When
    const path = links.lockscreen("wall-1", "k3y_-Az");

    // Then
    expect(path).toBe("/l/wall-1/k3y_-Az");
  });
});

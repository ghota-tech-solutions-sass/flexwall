import { expect, test } from "bun:test";
import { checkPlugins } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import officialStripe, { officialStripeConnector } from "@/plugins/official-stripe";

test("official Stripe exposes live aggregate values only and never claims connected-account verification", async () => {
  expect(checkPlugins([officialStripe])).toEqual([]);
  expect(officialStripeConnector.verified).toBe(false);
  const url = "https://flexwall.lol/api/public-stats/stripe";
  const request = { metrics: ["mrr"], params: {}, secret: null, public: null };
  const result = await officialStripeConnector.fetch(request, fakeContext({ [url]: { mode: "live", values: officialStripeConnector.sample, ignored: "private" } }));
  expect(Object.keys(result).sort()).toEqual(["mrr", "revenue-daily", "revenue30d", "subscribers"]);
  await expect(officialStripeConnector.fetch(request, fakeContext({ [url]: { mode: "test", values: officialStripeConnector.sample } }))).rejects.toThrow();
  await expect(officialStripeConnector.fetch(request, fakeContext({ [url]: { mode: "live", values: {} } }))).rejects.toThrow();
});

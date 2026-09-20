import { expect, test } from "bun:test";
import { checkPlugins } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import flexwall, { flexwallConnector } from "@/plugins/flexwall";

test("Flexwall reads only the documented aggregate metrics", async () => {
  expect(checkPlugins([flexwall])).toEqual([]);
  const ctx = fakeContext({});
  ctx.fetch.json = async (url) => {
    expect(url).toBe("https://flexwall.lol/api/public-stats");
    return { siteViews: 42, officialWallViews: 7, accounts: 3, walls: 2, published: 1, connectors: 30, widgets: 10, privateField: "not forwarded" } as never;
  };
  const result = await flexwallConnector.fetch({ metrics: ["accounts"], params: {}, secret: null, public: null }, ctx);
  expect(Object.keys(result).sort()).toEqual(["accounts", "connectors", "officialWallViews", "published", "siteViews", "walls", "widgets"]);
  expect(result.accounts).toMatchObject({ type: "number", value: 3 });
  ctx.fetch.json = async () => ({ accounts: "3" }) as never;
  await expect(flexwallConnector.fetch({ metrics: ["accounts"], params: {}, secret: null, public: null }, ctx)).rejects.toThrow();
});

import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, number } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { __CAMEL__Connector } from "../src/index";

/** Given / When / Then. Run with `bun test plugins/__ID__`. */
describe("__ID__ connector", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given a user, when followers are fetched, then the count comes back as a number", async () => {
    // Given
    const ctx = fakeContext({ "https://api.example.com/users/ada": { followers: 42 } });

    // When
    const values = await __CAMEL__Connector.fetch({ metrics: ["followers"], params: { user: "ada" }, secret: null, public: null }, ctx);

    // Then
    expect(values.followers).toEqual(number(42, { unit: "count" }));
  });

  test("given an unknown user, when fetched, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.example.com/users/": (_init, url) => {
        throw new HttpError(404, url, "");
      },
    });

    // When
    const attempt = __CAMEL__Connector.fetch({ metrics: ["followers"], params: { user: "nobody" }, secret: null, public: null }, ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });
});

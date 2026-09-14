import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, number } from "@flexwall/sdk";
import { fakeContext, satoriProblems, widgetProps } from "@flexwall/sdk/testing";
import plugin, { __CAMEL__Connector, __CAMEL__Widget } from "../src/index";

/** Tests are Given / When / Then. Run them with `bun test plugins/__ID__`. */
describe("__ID__ plugin", () => {
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
      "https://api.example.com/users/": () => {
        throw new HttpError(404, "https://api.example.com/users/nobody", "");
      },
    });

    // When
    const attempt = __CAMEL__Connector.fetch({ metrics: ["followers"], params: { user: "nobody" }, secret: null, public: null }, ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });

  test("given the widget at every size, when rendered, then images can draw it", () => {
    // Given
    const sizes = [
      { w: 1, h: 1 },
      { w: 2, h: 2 },
    ];

    // When
    const problems = sizes.flatMap((box) => satoriProblems(__CAMEL__Widget.render(widgetProps(__CAMEL__Widget, { inputs: { value: number(1280) }, box }))));

    // Then
    expect(problems).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { number } from "@flexwall/sdk";
import { satoriProblems, widgetProps } from "@flexwall/sdk/testing";
import { __CAMEL__Widget } from "../src/widget";

describe("__ID__ widget", () => {
  test("given every allowed size, when rendered, then images can draw it", () => {
    // Given
    const sizes = [
      { w: 1, h: 1 },
      { w: 2, h: 1 },
      { w: 1, h: 2 },
      { w: 2, h: 2 },
    ];

    // When
    const problems = sizes.flatMap((box) => satoriProblems(__CAMEL__Widget.render(widgetProps(__CAMEL__Widget, { inputs: { value: number(1280) }, box }))));

    // Then
    expect(problems).toEqual([]);
  });
});

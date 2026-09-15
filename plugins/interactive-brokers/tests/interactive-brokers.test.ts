import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BlockedRequestError, checkPlugins, ConnectorError, HttpError, money, series, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { elements, flexDate, interactiveBrokersConnector as ibkr, parseAttributes, parseFlexReply, parseStatement, timing } from "../src/index";

/**
 * Replies follow the samples in IBKR's "Configure Flex Web Service" guide and
 * its Version 3 error code table. The statement follows the element and
 * attribute names of Flex XML (as mapped by the ibflex parser); IBKR publishes
 * no full sample, so it was written by hand.
 */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");

const SERVICE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const TOKEN = "418273659102837465019283";
const QUERY = "987654";
const REFERENCE = "7302148866";
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { token: TOKEN }, public: { queryId: QUERY } });
const reply = (code: string, message = "Something happened.") =>
  `<FlexStatementResponse timestamp="15 September, 2026 08:30 AM EDT">\n<Status>Fail</Status>\n<ErrorCode>${code}</ErrorCode>\n<ErrorMessage>${message}</ErrorMessage>\n</FlexStatementResponse>`;
/** A statement with the given NAV rows as attribute strings. */
const statementWith = (rows: string[], account = "U7654321") =>
  `<FlexQueryResponse queryName="q" type="AF"><FlexStatements count="1"><FlexStatement accountId="${account}" fromDate="20260910" toDate="20260914"><EquitySummaryInBase>${rows
    .map((r) => `<EquitySummaryByReportDateInBase accountId="${account}" ${r} />`)
    .join("")}</EquitySummaryInBase></FlexStatement></FlexStatements></FlexQueryResponse>`;
/** Routes for both steps; GetStatement answers each body in turn, the last one repeating. */
const flex = (send: string, ...statements: string[]) => {
  let served = 0;
  return {
    [`${SERVICE}/SendRequest`]: send,
    [`${SERVICE}/GetStatement`]: () => statements[Math.min(served++, statements.length - 1)],
  };
};
const everything = (value: unknown) => JSON.stringify(value, Object.getOwnPropertyNames(value ?? {}));

let delays: number[];
beforeEach(() => {
  delays = timing.retryDelaysMs;
  timing.retryDelaysMs = [0, 0];
});
afterEach(() => {
  timing.retryDelaysMs = delays;
});

describe("interactive-brokers plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the metrics, when declared, then both are sensitive, NAV is on the wealth board, and values stay fresh six hours", () => {
    // Given
    const metrics = ibkr.metrics;

    // When
    const sensitive = metrics.filter((m) => m.sensitive).map((m) => m.id);
    const wealth = metrics.filter((m) => m.leaderboard === "wealth").map((m) => m.id);

    // Then
    expect(sensitive).toEqual(["nav", "nav-history"]);
    expect(wealth).toEqual(["nav"]);
    expect(ibkr.ttl).toBeGreaterThanOrEqual(6 * 3600);
    expect([ibkr.tier, ibkr.verified]).toEqual(["pro", true]);
  });

  describe("XML parsing", () => {
    test("given attributes with both quote styles and entities, when parsed, then values come back decoded", () => {
      // Given
      const source = ` name="Ada &amp; Charles" alias='a &lt;b&gt;' quote="&quot;x&quot;" code="&#65;&#x42;" total="1"`;

      // When
      const attributes = parseAttributes(source);

      // Then
      expect(attributes).toEqual({ name: "Ada & Charles", alias: "a <b>", quote: '"x"', code: "AB", total: "1" });
    });

    test("given similar tag names, a > inside a value and self-closing tags, when elements are listed, then only the exact tag matches", () => {
      // Given
      const xml = `<EquitySummaryInBase><EquitySummaryByReportDateInBase total="1" note="a > b"/><EquitySummaryByReportDateInBase total="2"></EquitySummaryByReportDateInBase></EquitySummaryInBase>`;

      // When
      const rows = elements(xml, "EquitySummaryByReportDateInBase");
      const sections = elements(xml, "EquitySummaryInBase");

      // Then
      expect(rows).toEqual([{ total: "1", note: "a > b" }, { total: "2" }]);
      expect(sections).toEqual([{}]);
    });

    test("given Flex dates in several formats, when read, then only yyyyMMdd and yyyy-MM-dd are understood", () => {
      // Given
      const raw = ["20260914", "2026-09-14", "20260914;083012", "09/14/2026", "14/09/2026", "20261340", "", undefined];

      // When
      const dates = raw.map(flexDate);

      // Then
      expect(dates).toEqual(["2026-09-14", "2026-09-14", "2026-09-14", null, null, null, null, null]);
    });

    test("given the documented replies, when parsed, then a reference code or an error code comes out, and a statement isn't a reply", () => {
      // Given
      const success = fixture("send-request");
      const failure = fixture("token-expired");

      // When
      const parsed = [parseFlexReply(success), parseFlexReply(failure), parseFlexReply(fixture("statement"))];

      // Then
      expect(parsed[0]).toMatchObject({ status: "Success", referenceCode: REFERENCE });
      expect(parsed[1]).toMatchObject({ status: "Fail", errorCode: "1012", errorMessage: "Token has expired." });
      expect(parsed[2]).toBeNull();
    });

    test("given a statement with days out of order, when parsed, then rows come oldest first with the account and currency", () => {
      // Given
      const xml = fixture("statement");

      // When
      const statement = parseStatement(xml);

      // Then
      expect(statement.accounts).toEqual(["U7654321"]);
      expect(statement.currency).toBe("usd");
      expect(statement.hasNavSection).toBe(true);
      expect(statement.rows.map((r) => [r.date, r.total, r.currency])).toEqual([
        ["2026-09-10", 403411.4, "usd"],
        ["2026-09-11", 408523.77, "usd"],
        ["2026-09-14", 412380.33, "usd"],
      ]);
    });

    test("given rows whose dates use an ambiguous format, when parsed, then the owner is told which Date Format to pick", () => {
      // Given
      const xml = statementWith([`currency="USD" reportDate="09/14/2026" total="10"`]);

      // When
      const attempt = () => parseStatement(xml);

      // Then
      expect(attempt).toThrow("yyyyMMdd or yyyy-MM-dd");
    });
  });

  test("given a ready statement, when both metrics are fetched, then NAV is the last day and the history every day", async () => {
    // Given
    const sent: (GuardedFetchInit | undefined)[] = [];
    const ctx = fakeContext({
      [`${SERVICE}/SendRequest`]: (init) => {
        sent.push(init);
        return fixture("send-request");
      },
      [`${SERVICE}/GetStatement`]: (init) => {
        sent.push(init);
        return fixture("statement");
      },
    });
    const keys = ibkr.metrics.map((m) => ibkr.cacheKey!({ metric: m.id, params: {} }));

    // When
    const values = await ibkr.fetch(request(["nav", "nav-history"]), ctx);

    // Then
    expect(values.nav).toEqual(money(412380.33, "usd"));
    expect(values["nav-history"]).toEqual(
      series(
        [
          { t: "2026-09-10", v: 403411.4 },
          { t: "2026-09-11", v: 408523.77 },
          { t: "2026-09-14", v: 412380.33 },
        ],
        { unit: "currency", currency: "usd" }
      )
    );
    expect(ctx.calls).toEqual([`${SERVICE}/SendRequest?t=${TOKEN}&q=${QUERY}&v=3`, `${SERVICE}/GetStatement?t=${TOKEN}&q=${REFERENCE}&v=3`]);
    expect(sent.every((init) => init?.headers?.["User-Agent"] === "Flexwall/1.0")).toBe(true);
    expect(new Set(keys).size).toBe(1);
  });

  test("given a statement still generating, when fetched, then GetStatement is retried until it's ready", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), fixture("in-progress"), fixture("statement")));

    // When
    const values = await ibkr.fetch(request(["nav"]), ctx);

    // Then
    expect(values.nav).toEqual(money(412380.33, "usd"));
    expect(ctx.calls.filter((u) => u.includes("GetStatement"))).toHaveLength(2);
  });

  test("given a statement that stays in progress, when fetched, then retries stop and the error passes through without the token", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), fixture("in-progress")));

    // When
    const error = await ibkr.fetch(request(["nav"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConnectorError);
    expect(ctx.calls.filter((u) => u.includes("GetStatement"))).toHaveLength(3);
    expect(everything(error)).not.toContain(TOKEN);
  });

  test("given a statement that stays in progress, when connecting, then the owner is asked to try again in a minute", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), fixture("in-progress")));

    // When
    const attempt = ibkr.connect!({ token: TOKEN, queryId: QUERY }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("Try connecting again in a minute");
  });

  test("given owner-fixable Flex errors, when fetched, then each becomes a sentence without the token", async () => {
    // Given
    const codes = ["1003", "1010", "1011", "1012", "1013", "1014", "1015", "1016", "1020"];

    // When
    const errors = [];
    for (const code of codes) errors.push(await ibkr.fetch(request(["nav"]), fakeContext(flex(reply(code)))).catch((e: unknown) => e));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect(everything(error)).not.toContain(TOKEN);
    }
    expect((errors[3] as Error).message).toContain("expired");
    expect((errors[6] as Error).message).toContain("refused the Flex token");
  });

  test("given transient Flex errors, when fetched, then they pass through as outages", async () => {
    // Given
    const codes = ["1001", "1009", "1018", "1021", "1099"];

    // When
    const errors = [];
    for (const code of codes) errors.push(await ibkr.fetch(request(["nav"]), fakeContext(flex(fixture("send-request"), reply(code)))).catch((e: unknown) => e));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConnectorError);
    }
  });

  test("given an HTTP failure, when fetched, then the status passes through and the URL with the token doesn't", async () => {
    // Given
    const ctx = fakeContext({
      [`${SERVICE}/SendRequest`]: (_init, url) => {
        throw new HttpError(503, url, `upstream saw ${url}`);
      },
    });

    // When
    const error = await ibkr.fetch(request(["nav"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(503);
    expect(everything(error)).not.toContain(TOKEN);
  });

  test("given a GetStatement answer that is neither a reply nor a statement, when fetched, then the error passes through without the token", async () => {
    // Given
    const page = `<html><body>Something went wrong for /GetStatement?t=${TOKEN}&q=${REFERENCE}</body></html>`;
    const ctx = fakeContext(flex(fixture("send-request"), page));

    // When
    const error = await ibkr.fetch(request(["nav"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConnectorError);
    expect(everything(error)).not.toContain(TOKEN);
  });

  test("given a statement too large for the host, when fetched, then the owner is told to trim the query", async () => {
    // Given
    const ctx = fakeContext({
      [`${SERVICE}/SendRequest`]: fixture("send-request"),
      [`${SERVICE}/GetStatement`]: () => {
        throw new BlockedRequestError("answered more than 4000 KB", "too-large");
      },
    });

    // When
    const attempt = ibkr.fetch(request(["nav"]), ctx);

    // Then
    await expect(attempt).rejects.toThrow("Net Asset Value (NAV) in Base");
  });

  test("given a query without the NAV section, when connecting, then the owner is told to add it", async () => {
    // Given
    const withoutNav = fixture("statement").replace(/<EquitySummaryInBase>[\s\S]*<\/EquitySummaryInBase>/, "");
    const ctx = fakeContext(flex(fixture("send-request"), withoutNav));

    // When
    const attempt = ibkr.connect!({ token: TOKEN, queryId: QUERY }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("has no Net Asset Value (NAV) in Base section");
  });

  test("given an empty NAV section, when fetched, then there's no NAV yet and an empty history", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), statementWith([])));

    // When
    const values = await ibkr.fetch(request(["nav", "nav-history"]), ctx);

    // Then
    expect(values.nav).toBeNull();
    expect(values["nav-history"]).toMatchObject({ type: "series", points: [] });
  });

  test("given a query over several accounts or a paper account, when connecting, then it's refused", async () => {
    // Given
    const several = fixture("statement").replace("</FlexStatements>", `<FlexStatement accountId="U1111111" fromDate="20260910" toDate="20260914" /></FlexStatements>`);
    const paper = statementWith([`currency="USD" reportDate="20260914" total="1000000"`], "DU1234567");

    // When
    const first = ibkr.connect!({ token: TOKEN, queryId: QUERY }, fakeContext(flex(fixture("send-request"), several))).catch((e: unknown) => e);
    const second = ibkr.connect!({ token: TOKEN, queryId: QUERY }, fakeContext(flex(fixture("send-request"), paper))).catch((e: unknown) => e);

    // Then
    expect(((await first) as Error).message).toContain("several accounts");
    expect(((await second) as Error).message).toContain("paper trading account");
  });

  test("given rows without a currency and no Account Information, when fetched, then the owner is told to include it", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), statementWith([`reportDate="20260914" total="1000"`])));

    // When
    const attempt = ibkr.fetch(request(["nav"]), ctx);

    // Then
    await expect(attempt).rejects.toThrow("Currency field");
  });

  test("given a valid token and query, when connecting, then the account is described without the token", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("send-request"), fixture("statement")));

    // When
    const result = await ibkr.connect!({ token: TOKEN, queryId: QUERY }, ctx);

    // Then
    expect(result.secret).toEqual({ token: TOKEN });
    expect(result.public).toEqual({ hint: "…9283", queryId: QUERY, account: "…4321", currency: "usd" });
    expect(result.label).toBe("Interactive Brokers (…4321)");
    expect(result.accountId).toBe("U7654321");
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(TOKEN);
    expect(shown).not.toContain(TOKEN.slice(0, 20));
    expect(shown).not.toContain("Lovelace");
  });

  test("given an expired token, when connecting, then the owner gets a sentence that doesn't repeat the token", async () => {
    // Given
    const ctx = fakeContext(flex(fixture("token-expired")));

    // When
    const error = await ibkr.connect!({ token: TOKEN, queryId: QUERY }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("Flex token has expired");
    expect(everything(error)).not.toContain(TOKEN.slice(-6));
    expect(ctx.calls).toHaveLength(1);
  });

  test("given the form, when a query id with letters is typed, then it's refused", () => {
    // Given
    const fields = ibkr.auth!.fields;

    // When
    const bad = validateFields(fields, { token: TOKEN, queryId: "abc123" });
    const good = validateFields(fields, { token: TOKEN, queryId: QUERY });

    // Then
    expect(bad.error).toContain("numeric Query ID");
    expect(good.error).toBeNull();
  });
});

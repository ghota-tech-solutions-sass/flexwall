# Interactive Brokers

A Flexwall plugin that reads the verified net asset value of an
[Interactive Brokers](https://www.interactivebrokers.com) account, through the
Flex Web Service (version 3).

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `interactive-brokers` | Pro, verified. One live account per connection. |

| Metric | Type | Where it comes from |
|---|---|---|
| `nav` | Money, base currency, sensitive | `total` of the latest `EquitySummaryByReportDateInBase` row. Competes on the wealth leaderboard. |
| `nav-history` | Series, base currency, sensitive | `total` of every row, one point per report date, oldest first. |

Sensitive metrics show as ranges ("$100k+") on public surfaces unless the owner
asks a tile for the exact number.

### What the number includes

NAV is IBKR's own "Net Asset Value (NAV) in Base" total at the close of the
last report date: cash, stocks, options, bonds, funds, commodities, interest
and dividend accruals, long minus short, every currency converted to the
account's base currency by IBKR. Open futures have no value there: their gains
and losses settle into cash each night.

It is an end-of-day figure. The latest row is usually the previous business
day, so the number never moves during the day. Values stay fresh for 6 hours.

## Setting up the Flex query

Everything happens in the IBKR Client Portal.

1. **Performance & Reports → Flex Queries**, then create an **Activity Flex
   Query** (the + next to Activity Flex Query).
2. Sections:
   - **Net Asset Value (NAV) in Base**: select all fields. Required. The
     connector reads `Report Date`, `Total`, `Currency` and `Account ID`.
   - **Account Information**: select all fields. Recommended: it gives the base
     currency when the NAV rows don't.
   - Nothing else. Every extra section makes the statement slower to generate
     and larger; past 4 MB it's refused.
3. Delivery configuration:
   - **Accounts**: a single account. A query over several accounts is refused.
   - **Format**: XML.
   - **Period**: Last 30 Calendar Days (any period works for `nav`; it sets how
     far `nav-history` goes back).
   - **Breakout by Day**: Yes. Without it the section holds a single row, and
     `nav-history` has one point.
4. General configuration: **Date Format** `yyyyMMdd` (IBKR's default) or
   `yyyy-MM-dd`. Formats like `MM/dd/yyyy` are refused: day and month can't be
   told apart reliably.
5. Save, and copy the **Query ID** shown next to the query.
6. **Flex Queries → Flex Web Service Configuration**: turn the service on, then
   **Generate New Token**:
   - **Should Expire After**: the longest period offered. The default is 6
     hours, which would break tiles the same day.
   - **Valid For IP Address**: leave it empty. Flexwall's servers don't have an
     address you could pin (IBKR answers error 1013 otherwise).

Paste the token and the Query ID into Flexwall. Generating a new token
invalidates the previous one: connect again when you do.

## Paper accounts

Paper accounts hold simulated money, and the wealth leaderboard can't exclude
one connection from ranking. Unlike Alpaca and Trading 212, IBKR serves paper
and live accounts from the same Flex Web Service, so there's no host to
restrict. The only guard is the account number: IBKR numbers paper accounts
`DU…`, and a statement for such an account is refused. It's a prefix check,
not a flag IBKR sends, so it's listed under "Not verified".

## Credentials and permissions

- **Flex token** (secret). It only runs saved Flex queries: it can't trade,
  move money or read anything the queries don't include. That is the least
  privilege IBKR offers for this.
- **Flex Query ID** (not secret, shown in the connection list).

Connecting runs the query once, so a wrong token, a wrong id, a missing NAV
section, an unreadable date format, several accounts or a paper account
(`DU…`) fail right away. The connection list shows the last four characters of
the token and of the account number; the account holder's name is never kept.

The token travels in the URL: that's IBKR's API design, with no header
alternative. The connector never logs URLs, and errors it lets through carry
neither the URL nor the response body.

## Requests and limits

IBKR allows **1 request a second and 10 a minute per token**. One refresh:

1. `GET https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=…&q=<query id>&v=3`
   answers a `ReferenceCode`.
2. `GET https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=…&q=<reference>&v=3`
   answers the statement, or error 1019 while it's being generated. The
   connector waits 2.5 s, then 5 s, and tries again: at most 4 requests and
   about 8 seconds per refresh. A render waits 4 seconds at most; the request
   finishes in the background and fills the cache.

Both requests send `User-Agent: Flexwall/1.0`, since IBKR requires one. The
SendRequest reply also names a GetStatement URL; it is ignored in favour of
the documented one, so a reply can never point requests elsewhere.

## Errors

IBKR answers errors as XML with HTTP 200, so they're read from `ErrorCode`:

| Codes | Meaning | Handling |
|---|---|---|
| 1003 | Statement not available | Sentence: check the query period |
| 1010 | Legacy Flex query | Sentence: create an Activity Flex Query |
| 1011 | Service inactive | Sentence: turn the Flex Web Service on |
| 1012 | Token expired | Sentence: generate a new token |
| 1013 | IP restriction | Sentence: token without an IP address |
| 1014 | Query invalid | Sentence: copy the Query ID again |
| 1015 | Token invalid | Sentence: copy the current token |
| 1016 | Account invalid | Sentence: check the account |
| 1020 | Request can't be validated | Sentence: check token and query id |
| 1019 | Generation in progress | Retried twice, then passed through |
| 1001, 1004–1009, 1017, 1018, 1021, unknown | Busy, not ready, throttled | Passed through (when connecting: "try again in a minute") |

HTTP errors pass through with the status only. A statement over 4 MB gets a
sentence asking to trim the query.

## Not verified against a real account

Built from IBKR's Flex Web Service guide, its error code table and the
"Net Asset Value in Base Currency" report reference, without a live token:

- the full statement XML: IBKR publishes no sample. Element and attribute
  names (`EquitySummaryInBase`, `EquitySummaryByReportDateInBase`, `total`,
  `reportDate`, `currency`, `accountId`) follow the open-source ibflex parser;
  the fixture was written by hand;
- that the section named "Net Asset Value (NAV) in Base" in the query editor is
  the one that produces `EquitySummaryInBase`;
- that `currency` on the NAV rows is the base currency;
- that a `User-Agent` of `Flexwall/1.0` is accepted (IBKR's examples are
  `Java/1.8` and `Python/3.4.1`);
- that GetStatement works on `ndcdyn` (IBKR's guide) rather than only on
  `gdcdyn` (which ibflex uses);
- how long generation takes for a small query, and so whether two retries are
  enough in practice;
- that paper trading accounts, numbered `DU…`, can run Flex queries at all.

## Develop

```bash
bun test plugins/interactive-brokers
bunx tsc --noEmit -p plugins/interactive-brokers/tsconfig.json
```

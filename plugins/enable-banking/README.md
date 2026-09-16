# Bank accounts

A Flexwall plugin that reads verified balances of an owner's bank accounts in
Europe, through open banking (PSD2 account information) with
[Enable Banking](https://enablebanking.com).

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `enable-banking` | Pro, verified. The owner signs in at their bank; Flexwall reads balances only. |

| Metric | Type | What |
|---|---|---|
| `balance` | Money, in the first account's currency. Sensitive: public walls show a range like "€10k+". Competes on the wealth leaderboard. | Sum of one balance per shared current or savings account |
| `accounts` | Count | Current and savings accounts shared with Flexwall. Needs no request. |

## How connecting works

The owner picks a **country** (the 30 Enable Banking covers: AT BE BG CY CZ DE
DK EE ES FI FR GR HR HU IE IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK; not
GB) and types the **bank** name as Enable Banking lists it
(<https://enablebanking.com/open-banking-apis>). Case and extra spaces don't
matter.

1. `authorize`: `GET /aspsps?country=<cc>&psu_type=personal&service=AIS` finds
   the bank by name and its `maximum_consent_validity`. An unknown name is
   refused naming it. Then `POST /auth` with
   `{ access: { valid_until }, aspsp: { name, country }, state, redirect_url, psu_type: "personal" }`
   gives the address to send the owner to. `valid_until` is now plus the
   bank's maximum less 10 minutes (180 days for most banks). If the bank list
   is too large to read (over 4 MB), the typed name is tried with 180 days;
   `POST /auth` answering `WRONG_ASPSP_PROVIDED` is refused naming the bank too.
2. The owner consents at Enable Banking and their bank, and picks accounts.
3. `complete`: `POST /sessions { code }` gives the session, its accounts and
   `access.valid_until`.
   - `secret`: the session id and the `uid`s of current and savings accounts.
   - `public`: bank name, country, account count, consent end date.
   - `label`: "Nordea (2 accounts)".
   - `expiresAt`: `access.valid_until`. There is no `refresh`: a PSD2 consent
     can't be renewed without the owner, so the host asks them to reconnect.
   - `accountId`: SHA-256 of country, bank name and the lowest
     `identification_hash` of the shared accounts. Enable Banking documents
     that hash as stable across sessions, unlike session ids and account uids,
     which change on every reconnect. Reconnecting the same bank replaces the
     connection, unless the owner shares a different set of accounts whose
     lowest hash differs: that makes a second connection.

Declining at the bank (`error=access_denied`), any other `error`, a missing
code, and a wrong, expired or already used code each end with a sentence.
Sessions sharing no account, or only card and loan accounts, are refused.

## How the balance is computed

For each account, up to **10**, in parallel:
`GET /accounts/{uid}/balances`, sent **without PSU headers** (Enable Banking
treats their absence as a background fetch, the only honest kind for a wall
render; sending some but not all a bank requires is a 422).

**One balance per account**, first type found in this order (a choice:
Enable Banking publishes no recommendation):

`ITBD` interim booked, `CLBD` closing booked, `XPCD` expected (instant),
`ITAV` interim available, `CLAV` closing available, `OPBD`, `PRCD`, `OPAV`,
`VALU`, `FWAV`, `INFO`, `OTHR`.

Booked first, because "available" balances can include an overdraft or credit
line, which isn't money the owner has. When a type appears twice, the latest
(`last_change_date_time`, else `reference_date`) wins.

**Summing**: in the currency of the first account's chosen balance. Accounts in
another currency are left out and counted in a log line; nothing is converted.
Rounded to the cent. Card (`CARD`) and loan (`LOAN`) accounts are never summed:
their balances are debt or available credit.

- An account with no usable balance is skipped (logged). When no account has
  one, `balance` is empty (`null`).
- An account the bank no longer shares (`ASPSP_ACCOUNT_NOT_ACCESSIBLE`) is
  skipped; when none is left: "Your bank no longer shares these accounts:
  reconnect your bank."
- More than 10 accounts: the first 10 are summed (logged); `accounts` still
  counts them all.

The wealth leaderboard compares amounts without converting currencies, like
every wealth connector.

## Limits

Most banks allow **about 4 unattended balance reads a day per account**
(PSD2 RTS; Enable Banking's FAQ), and Enable Banking advises waiting 6 hours
after `ASPSP_RATE_LIMIT_EXCEEDED`. `ttl` is therefore **6 hours**, which is 4
reads a day per account at most. Rate limits (429) and outages pass through, so
tiles keep their last value. Some banks bill each PSD2 call (Enable Banking's
Finland page mentions Säästöpankki).

## Removing a connection

`disconnect` sends `DELETE /sessions/{session_id}` with the application's JWT
(read as text), which ends the session and closes the bank consent where the
bank allows it. A 404 or one of the ended-session codes of the table below
(`EXPIRED_SESSION`, `REVOKED_SESSION`, `CLOSED_SESSION`, `SESSION_DOES_NOT_EXIST`, …)
counts as already ended; no application or no stored session means nothing is sent.

## Errors

Enable Banking asks clients to branch on the `error` code of the body, not the
status (an expired session is a 401, like other failures):

| Code | Result |
|---|---|
| `EXPIRED_SESSION`, `REVOKED_SESSION`, `CLOSED_SESSION`, `SESSION_DOES_NOT_EXIST`, `WRONG_SESSION_STATUS`, `ACCOUNT_DOES_NOT_EXIST` | "Reconnect your bank: its consent ended." |
| `ASPSP_PSU_ACTION_REQUIRED` | "Reconnect your bank: it wants you to confirm something before sharing again." |
| `WRONG_ASPSP_PROVIDED` | The unknown bank sentence |
| `WRONG_AUTHORIZATION_CODE`, `EXPIRED_AUTHORIZATION_CODE`, `ALREADY_AUTHORIZED` | "That bank sign-in expired or was already used. Connect again." |
| `UNAUTHORIZED_ACCESS`, `ACCESS_DENIED` | "Enable Banking refused this Flexwall server's application." |
| `REDIRECT_URI_NOT_ALLOWED` | "This Flexwall server's Enable Banking application doesn't allow its callback address." |
| Anything else, including a 401 without a code | Passed through |

## Signing

Every call carries `Authorization: Bearer <JWT>`, one JWT per pass: header
`{ typ: "JWT", alg: "RS256", kid: <application id> }`, claims
`{ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp }` with
`exp` one hour after `iat` (Enable Banking refuses more than 24 hours; the old
`api.tilisy.com` audience is deprecated). Signed with WebCrypto
(RSASSA-PKCS1-v1_5, SHA-256). Tests verify signatures with the public key of an
RSA pair generated when they start.

## Operator setup

1. Create an account on the Enable Banking Control Panel
   (<https://enablebanking.com/sign-in/>).
2. Register a **production** application (sandbox apps can't be moved to
   production). Either let the form generate the key in the browser and export
   the private key, or make your own:
   ```bash
   openssl genrsa -out private.key 4096
   openssl req -new -x509 -days 365 -key private.key -out public.crt -subj "/CN=flexwall.lol"
   openssl pkcs8 -topk8 -nocrypt -in private.key -out private.pk8   # WebCrypto needs PKCS#8
   ```
   and upload `public.crt`. Keep the private key on the server only.
3. Allowed redirect URL: `https://flexwall.lol/api/connections/oauth/callback`
   (the host's callback; for self-hosting, your own origin).
4. Production apps also need a description, a data protection email, and terms
   and privacy policy links, which Enable Banking checks and shows to people
   consenting.
5. Server environment:
   - `ENABLE_BANKING_APP_ID`: the application id (JWT `kid`).
   - `ENABLE_BANKING_PRIVATE_KEY`: the PEM, `-----BEGIN PRIVATE KEY-----`
     (PKCS#8), with real newlines or `\n` escapes. A PKCS#1 key
     (`BEGIN RSA PRIVATE KEY`, what OpenSSL 1.x `genrsa` writes) is refused with
     the conversion command.
   - `ENABLE_BANKING_ENV`: `sandbox` (the default) or `production`. Sandbox and
     production applications share one API address, so this is what the back
     office reports; anything but `production` counts as sandbox, and sandbox
     connectors stay with administrators.
   Missing either of the first two: "This Flexwall server has no Enable Banking
   application." All three must be in the variables plugins may read (`CONNECTOR_ENV` in
   `apps/web/src/composition.ts`), in `connector_secrets` in Terraform, and in
   `docs/self-hosting.md`.
6. **Activation.** Until a contract is signed and KYB is done, a production app
   can only be activated in **restricted mode** by linking your own accounts:
   the API then returns only those linked accounts, and anyone else's
   consent comes back with an empty account list ("Your bank shared no
   account…"). Applications can't be offered to the public before a contract.
7. **Pricing** (to confirm with Enable Banking, info@enablebanking.com): volume
   based, by accounts accessed per month, with a monthly minimum.

## Not verified against a real account

- Fixtures follow the API reference examples, trimmed; no response was recorded.
  The reference's balance example says `CLAV` with the name "Booked balance";
  the fixture uses `CLBD`.
- Which balance types each bank really returns, and whether a bank's "available"
  types include overdrafts.
- The HTTP status of `WRONG_ASPSP_PROVIDED`, the authorization code errors and
  `ASPSP_ACCOUNT_NOT_ACCESSIBLE`; handling keys on the `error` code only.
- What `POST /auth` answers when `valid_until` exceeds the bank's maximum (the
  list lookup exists to avoid it), and whether a 10-minute margin is enough.
- The size of `GET /aspsps` for large countries (Germany) and whether it stays
  under 4 MB with the `psu_type` and `service` filters.
- That `ACCOUNT_DOES_NOT_EXIST` on a stored uid means the session ended (uids
  are documented as valid only while the session is `AUTHORIZED`).
- Whether `query.state` and `error` always come back as documented in the
  callback for every bank.
- Pricing and restricted-mode details beyond the FAQ.

## Develop

```bash
bun test plugins/enable-banking
bunx tsc --noEmit -p plugins/enable-banking/tsconfig.json
```

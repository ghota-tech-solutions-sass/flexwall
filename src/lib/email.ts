/**
 * Transactional mail through Google Workspace (Gmail API), same mechanism as
 * kitten-clash: no key file, the Cloud Run service account signs a JWT for
 * itself via the IAM Credentials API and exchanges it for a Gmail token acting
 * as EMAIL_IMPERSONATE (domain-wide delegation, gmail.send scope only).
 *
 * Absent configuration disables the channel (sender is null) instead of
 * failing a request.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<"ok" | "rejected">;

const METADATA = "http://metadata.google.internal/computeMetadata/v1";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${b64(value)}?=`;
}

export function buildMimeMessage(from: string, message: EmailMessage): string {
  const boundary = "fw-boundary-2c9e41";
  const wrap = (s: string) => b64(s).replace(/(.{76})/g, "$1\r\n");
  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function metadata(path: string): Promise<string> {
  const res = await fetch(`${METADATA}/${path}`, { headers: { "Metadata-Flavor": "Google" } });
  if (!res.ok) throw new Error(`metadata ${path}: ${res.status}`);
  return res.text();
}

let _sender: EmailSender | null | undefined;

/** Lazy singleton. Null when EMAIL_IMPERSONATE is not set. */
export function getEmailSender(): EmailSender | null {
  if (_sender !== undefined) return _sender;
  _sender = createGmailSender();
  return _sender;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.EMAIL_IMPERSONATE?.trim());
}

function createGmailSender(): EmailSender | null {
  const mailbox = process.env.EMAIL_IMPERSONATE?.trim();
  if (!mailbox) return null;
  const from = process.env.EMAIL_FROM?.trim() || mailbox;

  let cached: { token: string; expiresAt: number } | null = null;

  const accessToken = async (): Promise<string> => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const serviceAccount =
      process.env.EMAIL_SERVICE_ACCOUNT?.trim() || (await metadata("instance/service-accounts/default/email"));
    const runtime = JSON.parse(await metadata("instance/service-accounts/default/token")) as { access_token: string };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: serviceAccount, sub: mailbox, scope: GMAIL_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
    const signed = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:signJwt`, {
      method: "POST",
      headers: { authorization: `Bearer ${runtime.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ payload: JSON.stringify(claims) }),
    });
    if (!signed.ok) throw new Error(`signJwt: ${signed.status}`);
    const { signedJwt } = (await signed.json()) as { signedJwt: string };
    const exchanged = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt }),
    });
    if (!exchanged.ok) throw new Error(`token exchange: ${exchanged.status}`);
    const token = (await exchanged.json()) as { access_token: string; expires_in: number };
    cached = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
    return cached.token;
  };

  const send = async (raw: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });

  return async (message) => {
    const raw = Buffer.from(buildMimeMessage(from, message), "utf8").toString("base64url");
    let res = await send(raw);
    if (res.status === 401) {
      cached = null; // stale token: the one failure worth a retry
      res = await send(raw);
    }
    if (!res.ok) console.error("gmail send failed:", res.status, await res.text().catch(() => ""));
    return res.ok ? "ok" : "rejected";
  };
}

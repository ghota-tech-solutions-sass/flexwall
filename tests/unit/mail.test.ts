import { describe, expect, test } from "bun:test";
import { buildMimeMessage } from "../../src/lib/email";
import { passedMail, welcomeMail } from "../../src/lib/mail-templates";
import { xIntentUrl } from "../../src/lib/share";

describe("mail", () => {
  test("MIME has both parts and encoded subject", () => {
    const raw = buildMimeMessage("flexwall.lol <a@b.c>", { to: "x@y.z", subject: "Éé ★", html: "<b>hi</b>", text: "hi" });
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
  });
  test("templates escape html in names", () => {
    const m = welcomeMail("x@y.z", { name: "<script>alert(1)</script>", rank: 1, total: 1, amountUSD: 100, link: "https://l", shareUrl: "https://s", xUrl: "https://x" });
    expect(m.html).not.toContain("<script>alert(1)</script>");
    const p = passedMail("x@y.z", { name: "a", byName: "<img src=x>", byAmountUSD: 200, newRank: 2, total: 2, toReclaimUSD: 101, link: "https://l" });
    expect(p.html).not.toContain("<img src=x>");
  });
  test("x intent url is well-formed", () => {
    const u = new URL(xIntentUrl({ rank: 7, amountUSD: 310000, url: "https://flexwall.lol/share/x" }));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("url")).toBe("https://flexwall.lol/share/x");
  });
});

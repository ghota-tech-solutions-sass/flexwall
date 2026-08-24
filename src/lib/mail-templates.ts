import { formatUSD } from "@/lib/board";
import type { EmailMessage } from "@/lib/email";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function shell(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0c0e;color:#f2f3f5;font-family:-apple-system,Segoe UI,Inter,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<p style="font:600 13px ui-monospace,Menlo,monospace;letter-spacing:.3em;color:#8b929c;margin:0 0 26px">FLEXWALL.LOL</p>
${body}
<p style="margin:36px 0 0;font:400 12px ui-monospace,Menlo,monospace;color:#6a707a">${footer}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:26px 0"><a href="${href}" style="display:inline-block;background:#35d07f;color:#0b0c0e;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:8px">${label}</a></p>`;
}

export function seatLinkMail(to: string, name: string, link: string): EmailMessage {
  const subject = "Your seat on flexwall.lol";
  const text = `Here is the link to your seat on flexwall.lol (${name}):\n\n${link}\n\nIt works for 30 minutes, then you can ask for a new one from flexwall.lol/me.\nIf you did not ask for this, ignore this email.`;
  const html = shell(
    `<h1 style="font:italic 700 30px Georgia,serif;margin:0 0 12px">Your seat, <span style="color:#35d07f">${esc(name)}</span>.</h1>
<p style="margin:0;color:#c9ced6">Open the link below to see your rank and your payments.</p>
${button(link, "Open my seat")}
<p style="margin:0;color:#8b929c;font-size:14px">The link works for 30 minutes. After that, ask for a new one from <a href="https://flexwall.lol/me" style="color:#e6c37c">flexwall.lol/me</a>.</p>`,
    "If you did not ask for this, ignore this email.",
  );
  return { to, subject, html, text };
}

export function welcomeMail(
  to: string,
  opts: { name: string; rank: number; total: number; amountUSD: number; link: string; shareUrl: string; xUrl: string },
): EmailMessage {
  const amount = formatUSD(opts.amountUSD);
  const subject = `You are #${opts.rank} on flexwall.lol`;
  const text = `${opts.name}: ${amount} on public display, rank #${opts.rank} of ${opts.total}.\n\nYour seat (rank, payments, who is above you):\n${opts.link}\n\nShare card:\n${opts.shareUrl}\n\nPost it on X:\n${opts.xUrl}\n\nThis link works for 7 days. Later, get a fresh one from flexwall.lol/me with this email.\nNo refunds.`;
  const html = shell(
    `<h1 style="font:italic 700 30px Georgia,serif;margin:0 0 12px">You are <span style="color:#35d07f">on the wall.</span></h1>
<p style="margin:0 0 6px;font-size:18px"><b>${esc(opts.name)}</b> · ${amount}</p>
<p style="margin:0;color:#c9ced6">Rank <b style="color:#e6c37c">#${opts.rank}</b> of ${opts.total}.</p>
${button(opts.link, "Open my seat")}
<p style="margin:0 0 10px;color:#c9ced6">Tell them:</p>
<p style="margin:0"><a href="${opts.xUrl}" style="color:#35d07f">Post on X</a> &nbsp;·&nbsp; <a href="${opts.shareUrl}" style="color:#e6c37c">Share card</a></p>
<p style="margin:26px 0 0;color:#8b929c;font-size:14px">This link works for 7 days. Later, get a fresh one from <a href="https://flexwall.lol/me" style="color:#e6c37c">flexwall.lol/me</a> with this email.</p>`,
    "No refunds. Your name and amount stay on the wall.",
  );
  return { to, subject, html, text };
}

export function passedMail(
  to: string,
  opts: { name: string; byName: string; byAmountUSD: number; newRank: number; total: number; toReclaimUSD: number; link: string },
): EmailMessage {
  const subject = "You just got passed on flexwall.lol";
  const reclaim = formatUSD(opts.toReclaimUSD);
  const text = `${opts.byName} put ${formatUSD(opts.byAmountUSD)} on the wall and went above you.\nYou are now #${opts.newRank} of ${opts.total}.\n\nTake your place back (+${reclaim}):\n${opts.link}\n\nTop-ups have no minimum. No refunds.\nYou get this email because your seat on flexwall.lol lost a rank.`;
  const html = shell(
    `<h1 style="font:italic 700 30px Georgia,serif;margin:0 0 12px">You just got <span style="color:#e5484d">passed.</span></h1>
<p style="margin:0 0 6px;color:#c9ced6"><b style="color:#f2f3f5">${esc(opts.byName)}</b> put ${formatUSD(opts.byAmountUSD)} on the wall and went above you.</p>
<p style="margin:0;color:#c9ced6">You are now <b style="color:#e6c37c">#${opts.newRank}</b> of ${opts.total}.</p>
${button(opts.link, "Take my place back · +" + reclaim)}
<p style="margin:0;color:#8b929c;font-size:14px">Top-ups have no minimum. The wall keeps the whole history either way.</p>`,
    "You get this email because your seat on flexwall.lol lost a rank. No refunds.",
  );
  return { to, subject, html, text };
}

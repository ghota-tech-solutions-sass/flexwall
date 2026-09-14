import type { EmailMessage } from "@/lib/email";

function shell(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;color:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:540px;margin:0 auto;padding:36px 24px">
<p style="font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.3em;color:#8a867e;margin:0 0 26px">FLEXWALL.LOL</p>
${body}
<p style="margin:36px 0 0;font:400 12px ui-monospace,Menlo,monospace;color:#6b675f">Anyone with these links can see or edit your wallpaper. Keep them to yourself.</p>
</div></body></html>`;
}

export function proMail(to: string, opts: { editUrl: string; imageUrl: string }): EmailMessage {
  const subject = "Your Flexwall is Pro";
  const text = `Pro is on: every theme, no watermark. Your phone picks it up at the next refresh.\n\nEdit your wallpaper (keep this link, it's your login):\n${opts.editUrl}\n\nThe image URL your Shortcut uses:\n${opts.imageUrl}\n\nAnyone with these links can see or edit your wallpaper. Keep them to yourself.`;
  const html = shell(
    `<h1 style="font:800 28px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0 0 12px">Pro is on.</h1>
<p style="margin:0;color:#8a867e">Every theme, no watermark. Your phone picks it up at the next refresh.</p>
<p style="margin:26px 0"><a href="${opts.editUrl}" style="display:inline-block;background:#f4f1ea;color:#0b0b0c;font:700 14px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;text-decoration:none;padding:14px 22px;border-radius:999px">Edit my wallpaper</a></p>
<p style="margin:0;color:#8a867e;font-size:14px">This link is your login. Keep this email.</p>
<p style="margin:22px 0 0;color:#8a867e;font-size:13px">Shortcut image URL:<br><span style="font-family:ui-monospace,Menlo,monospace;color:#f4f1ea;word-break:break-all">${opts.imageUrl}</span></p>`
  );
  return { to, subject, html, text };
}

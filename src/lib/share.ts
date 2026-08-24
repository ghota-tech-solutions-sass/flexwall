/** Prefilled "post on X" intent for a seat. Opens the composer; nothing is posted without the user. */
export function xIntentUrl(opts: { rank: number; amountUSD: number; url: string }): string {
  const text =
    `I'm #${opts.rank} on flexwall.lol with $${Math.round(opts.amountUSD).toLocaleString("en-US")} on public display. ` +
    "Come and take it.";
  const params = new URLSearchParams({ text, url: opts.url });
  return "https://x.com/intent/post?" + params.toString();
}

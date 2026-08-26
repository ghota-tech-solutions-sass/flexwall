/** Prefilled "post on X" intent for a spot. Opens the composer; nothing is posted without the user. */
export function xIntentUrl(opts: { rank: number; amountUSD: number; url: string }): string {
  const amount = Math.round(opts.amountUSD);
  const text =
    `I paid $${amount.toLocaleString("en-US")} to be #${opts.rank} on flexwall.lol. ` +
    `Anyone can outbid me for $${(amount + 1).toLocaleString("en-US")}. Please don't.`;
  const params = new URLSearchParams({ text, url: opts.url });
  return "https://x.com/intent/post?" + params.toString();
}

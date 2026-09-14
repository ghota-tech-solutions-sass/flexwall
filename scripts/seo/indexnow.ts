#!/usr/bin/env bun
/**
 * Submits the sitemap's addresses to IndexNow.
 *
 * CI runs it after each deploy, when pages change. It reads the sitemap in
 * production rather than rebuilding it, so it submits exactly what engines
 * will find.
 *
 *   bun scripts/seo/indexnow.ts [https://flexwall.lol]
 */

import { buildIndexNowSubmission, INDEXNOW_ENDPOINT, INDEXNOW_KEY } from "../../apps/web/src/presentation/seo/indexnow";

const siteUrl = process.argv[2] ?? "https://flexwall.lol";

// Without the key online, engines refuse the submission (403): say so plainly.
const keyFile = await fetch(`${siteUrl}/${INDEXNOW_KEY}.txt`);
const served = keyFile.ok ? (await keyFile.text()).trim() : "";
if (served !== INDEXNOW_KEY) {
  console.error(`indexnow: key missing or different on ${siteUrl} (HTTP ${keyFile.status})`);
  process.exit(1);
}

const sitemap = await fetch(`${siteUrl}/sitemap.xml`);
if (!sitemap.ok) {
  console.error(`indexnow: sitemap unreadable (HTTP ${sitemap.status})`);
  process.exit(1);
}

const submission = buildIndexNowSubmission(await sitemap.text(), siteUrl);
if (submission.urlList.length === 0) {
  console.error("indexnow: no address in the sitemap");
  process.exit(1);
}

const response = await fetch(INDEXNOW_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(submission),
});

// 200: received. 202: received, key being checked (first submission).
if (response.status !== 200 && response.status !== 202) {
  console.error(`indexnow: refused, HTTP ${response.status} ${await response.text()}`);
  process.exit(1);
}
console.log(`indexnow: ${submission.urlList.length} addresses submitted (HTTP ${response.status})`);

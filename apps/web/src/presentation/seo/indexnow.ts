/**
 * IndexNow: tells Bing, Yandex, Seznam and Naver that pages changed instead of
 * waiting for their next crawl.
 *
 * The key isn't a secret. The protocol publishes it: engines check it by
 * reading public/<key>.txt at the site root. It only proves that whoever
 * submits controls the domain. Changing it means renaming that file too; a
 * test watches for it.
 */

export const INDEXNOW_KEY = "0e409c4aabf5f0ad27f43255f874f1d7";

/** Shared endpoint: a submission is relayed to every participating engine. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export interface IndexNowSubmission {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function buildIndexNowSubmission(sitemapXml: string, siteUrl: string): IndexNowSubmission {
  const site = new URL(siteUrl);
  const urlList = [...sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1]!.replace(/&amp;/g, "&"))
    // One address on another host gets the whole submission refused (422).
    .filter((url) => {
      try {
        return new URL(url).host === site.host;
      } catch {
        return false;
      }
    });
  return { host: site.host, key: INDEXNOW_KEY, keyLocation: `${site.origin}/${INDEXNOW_KEY}.txt`, urlList: [...new Set(urlList)] };
}

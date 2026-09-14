import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { number } from "@flexwall/sdk";
import { clip, inSentence, wallDescription } from "@/presentation/seo/descriptions";
import { buildIndexNowSubmission, INDEXNOW_KEY } from "@/presentation/seo/indexnow";
import { integrationPage } from "@/presentation/seo/integrations";
import { llmsTxt } from "@/presentation/seo/llms";
import { pageMetadata } from "@/presentation/seo/metadata";
import { sitemapEntries } from "@/presentation/seo/site-map";
import { breadcrumbLd, profilePageLd, serializeJsonLd, softwareApplicationLd } from "@/presentation/seo/structured-data";
import { connectorShowcase, sampleStates } from "@/rendering/samples";
import { catalog } from "@/plugins/registry";

const ORIGIN = "https://flexwall.test";

describe("Structured data", () => {
  test("given a bio that tries to close the script tag, when serialized, then no raw angle bracket survives", () => {
    // Given
    const data = profilePageLd({ origin: ORIGIN, handle: "ada", title: "Ada", bio: "</script><script>alert(1)</script>", createdAt: 0, updatedAt: 0 });

    // When
    const json = serializeJsonLd(data);

    // Then
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
    expect(JSON.parse(json).mainEntity.description).toBe("</script><script>alert(1)</script>");
  });

  test("given a wall, when described as a profile page, then the person carries the handle and the page's canonical address", () => {
    // Given
    const input = { origin: ORIGIN, handle: "ada-builds", title: "Ada Builds", bio: "Shipping in public", createdAt: Date.UTC(2026, 0, 1), updatedAt: Date.UTC(2026, 8, 14) };

    // When
    const ld = profilePageLd(input);

    // Then
    expect(ld).toMatchObject({
      "@type": "ProfilePage",
      url: "https://flexwall.test/@ada-builds",
      dateModified: "2026-09-14T00:00:00.000Z",
      mainEntity: { "@type": "Person", name: "Ada Builds", alternateName: "@ada-builds", description: "Shipping in public" },
    });
  });

  test("given the plans, when described as an application, then every offer is in US dollars with taxes included", () => {
    // Given / When
    const ld = softwareApplicationLd(ORIGIN) as { offers: { name: string; price: string; priceCurrency: string; priceSpecification: { valueAddedTaxIncluded: boolean; billingDuration?: string } }[] };

    // Then
    expect(ld.offers.map((o) => [o.name, o.price])).toEqual([
      ["Free", "0.00"],
      ["Pro, monthly", "6.00"],
      ["Pro, yearly", "48.00"],
      ["Lifetime", "99.00"],
    ]);
    expect(ld.offers.every((o) => o.priceCurrency === "USD" && o.priceSpecification.valueAddedTaxIncluded)).toBe(true);
    expect(ld.offers[2]!.priceSpecification.billingDuration).toBe("P1Y");
  });

  test("given a trail of pages, when described as breadcrumbs, then positions start at one with absolute addresses", () => {
    // Given / When
    const ld = breadcrumbLd(`${ORIGIN}/`, [{ name: "Flexwall", path: "/" }, { name: "@ada", path: "/@ada" }]) as { itemListElement: { position: number; item: string }[] };

    // Then
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Flexwall", item: "https://flexwall.test/" },
      { "@type": "ListItem", position: 2, name: "@ada", item: "https://flexwall.test/@ada" },
    ] as never);
  });
});

describe("Wall descriptions", () => {
  test("given a wall with public numbers, when described, then the snippet leads with them and follows with the bio", () => {
    // Given
    const numbers = [
      { label: "MRR", value: number(4820, { unit: "currency", currency: "usd" }) },
      { label: "day streak", value: number(47, { unit: "count" }) },
    ];

    // When
    const description = wallDescription({ handle: "ada", title: "Ada Builds", bio: "Indie hacker.", numbers });

    // Then
    expect(description).toBe("Ada Builds on Flexwall: $4,820 MRR, 47 day streak. Indie hacker.");
  });

  test("given a sensitive balance among the numbers, when described, then the snippet gives its range, not the amount", () => {
    // Given
    const numbers = [{ label: "Portfolio", value: number(2_431_900, { unit: "currency", currency: "usd" }), range: true }];

    // When
    const description = wallDescription({ handle: "ada", title: "Ada", bio: "", numbers });

    // Then
    expect(description).toBe("Ada on Flexwall: $1M+ portfolio.");
  });

  test("given a wall with neither numbers nor bio, when described, then it still says whose numbers these are", () => {
    // Given / When
    const description = wallDescription({ handle: "ada", title: "", bio: "", numbers: [] });

    // Then
    expect(description).toBe("Live numbers from @ada on Flexwall.");
  });

  test("given labels in title case or acronyms, when put in a sentence, then only the title case is lowered", () => {
    // Given / When / Then
    expect(inSentence("Commit streak")).toBe("commit streak");
    expect(inSentence("MRR")).toBe("MRR");
    expect(inSentence("npm downloads")).toBe("npm downloads");
  });

  test("given a long text, when clipped, then it stops at a word and says it was cut", () => {
    // Given
    const text = "word ".repeat(80);

    // When
    const clipped = clip(text, 50);

    // Then
    expect(clipped.length).toBeLessThanOrEqual(50);
    expect(clipped.endsWith("word…")).toBe(true);
  });
});

describe("Integration pages", () => {
  test("given the Stripe connector, when its page is built, then the title names what people search and credentials say what to create", () => {
    // Given
    const stripe = catalog.connector("stripe")!;

    // When
    const page = integrationPage(stripe, catalog.widgets());

    // Then
    expect(page.path).toBe("/integrations/stripe");
    expect(page.title).toBe("Stripe widget: MRR and revenue on a public page");
    expect(page.verified).toBe(true);
    expect(page.credentials?.fields.length).toBeGreaterThan(0);
    expect(page.widgets.map((w) => w.id)).toContain("stat");
    expect(page.description.length).toBeLessThanOrEqual(180);
  });

  test("given every installed connector, when shown as example tiles, then each tile fits the grid and has sample values to draw", () => {
    for (const connector of catalog.connectors()) {
      // Given
      const tiles = connectorShowcase(connector, catalog, "2026-09-14");

      // When
      const states = sampleStates(tiles, catalog);

      // Then
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) {
        expect(tile.layout.x + tile.layout.w).toBeLessThanOrEqual(4);
        expect(states[tile.id]).toMatchObject({ status: "ready" });
        expect(Object.keys((states[tile.id] as { inputs: object }).inputs).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Sitemap", () => {
  test("given listed walls and integrations, when the sitemap is built, then every public page is there with the latest wall dating The Wall", () => {
    // Given
    const walls = [
      { handle: "ada", updatedAt: Date.UTC(2026, 8, 1) },
      { handle: "linus", updatedAt: Date.UTC(2026, 8, 10) },
    ];
    const integrations = [integrationPage(catalog.connector("github")!, catalog.widgets())];

    // When
    const entries = sitemapEntries({ origin: ORIGIN, walls, integrations });

    // Then
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://flexwall.test/integrations/github");
    expect(urls).toContain("https://flexwall.test/fr/cgv");
    expect(urls).toContain("https://flexwall.test/@linus");
    expect(entries.find((e) => e.url.endsWith("/explore"))?.lastModified).toEqual(new Date(Date.UTC(2026, 8, 10)));
  });
});

describe("llms.txt", () => {
  test("given the integrations, when llms.txt is written, then it lists plans with prices and links every integration", () => {
    // Given
    const integrations = catalog.connectors().map((c) => integrationPage(c, catalog.widgets()));

    // When
    const text = llmsTxt(ORIGIN, integrations);

    // Then
    expect(text.startsWith("# Flexwall\n")).toBe(true);
    expect(text).toContain("$6 a month or $48 a year");
    for (const i of integrations) expect(text).toContain(`(https://flexwall.test${i.path})`);
  });
});

describe("IndexNow", () => {
  test("given a sitemap with an address on another host, when submitted, then only this site's addresses go, once each", () => {
    // Given
    const xml = "<urlset><url><loc>https://flexwall.lol/</loc></url><url><loc>https://flexwall.lol/explore</loc></url><url><loc>https://flexwall.lol/</loc></url><url><loc>https://evil.test/x</loc></url></urlset>";

    // When
    const submission = buildIndexNowSubmission(xml, "https://flexwall.lol");

    // Then
    expect(submission).toEqual({
      host: "flexwall.lol",
      key: INDEXNOW_KEY,
      keyLocation: `https://flexwall.lol/${INDEXNOW_KEY}.txt`,
      urlList: ["https://flexwall.lol/", "https://flexwall.lol/explore"],
    });
  });

  test("given the key, when the site is built, then its verification file is published with the key as content", () => {
    // Given
    const file = join(import.meta.dir, "../../public", `${INDEXNOW_KEY}.txt`);

    // When / Then
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});

describe("Page metadata", () => {
  test("given a page, when its metadata is built, then social tags repeat the title, description and canonical address", () => {
    // Given / When
    const metadata = pageMetadata({ title: "Pricing", description: "Plans.", path: "/pricing" });

    // Then
    expect(metadata.alternates?.canonical).toBe("/pricing");
    expect(metadata.openGraph).toMatchObject({ siteName: "Flexwall", url: "/pricing", title: "Pricing", description: "Plans." });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Pricing" });
  });
});

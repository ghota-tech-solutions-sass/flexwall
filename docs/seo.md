# Search and sharing

What flexwall.lol does so search engines, social networks and AI assistants
understand its pages, and where each piece lives.

## Pages and addresses

- **One address per page.** `www.flexwall.lol` redirects permanently to the apex, path and query kept (`next.config.ts`). Walls answer at `/@handle`; `/@Ada_Builds` redirects to `/@ada-builds`. Every indexable page sets a canonical address.
- **Metadata** comes from `pageMetadata()` (`src/presentation/seo/metadata.ts`): title, description, canonical, and the matching Open Graph and Twitter tags. Next merges metadata shallowly, so pages go through the helper instead of setting `openGraph` by hand.
- **Titles** follow `Page | Flexwall`. Wall titles are `Title (@handle)`.
- **Wall descriptions** lead with the wall's first public numbers, then its bio (`wallDescription()`): "Ada Builds on Flexwall: $4,820 MRR, 47 day streak. Indie hacker." The wall page and its metadata share one load and one resolve per request (`React.cache`).

## Integration pages

`/integrations` and `/integrations/[id]` are generated from the plugin catalog
(`integrationPage()`), so a new connector gets its page, card and sitemap entry
with no extra work. Each page shows example tiles drawn from the connector's
declared samples (`connectorShowcase()`), what it measures, what it needs and
why, and which tiles can show it. Titles target what people search:
"Stripe widget: MRR and revenue on a public page".

## Social cards

| Route | Card |
|---|---|
| `/`, and pages without their own | `app/opengraph-image.tsx`, `app/twitter-image.tsx` |
| `/pricing`, `/explore` | their own `opengraph-image.tsx` |
| `/integrations/[id]` | example tiles of that connector |
| `/@handle` | the wall's first two rows of public tiles, live |

Site cards use sample numbers only and are cacheable; wall cards are drawn per
request. All share one layout (`card()` in `src/rendering/images.tsx`).

## Structured data

`<JsonLd>` renders schema.org objects built by pure functions in
`src/presentation/seo/structured-data.ts`, escaped so user-typed titles and bios
can't close the script element.

| Page | Types |
|---|---|
| Home | Organization, WebSite |
| Pricing | SoftwareApplication with Offers (USD, taxes included) |
| Walls | ProfilePage (Person), BreadcrumbList |
| The Wall | BreadcrumbList, ItemList |
| Integrations | BreadcrumbList, ItemList on the index |

Prices in `PLAN_PRICES_USD` mirror `terraform/variables.tf`; change both.

## Crawling

- `sitemap.xml`: home, The Wall (dated by the latest listed wall), pricing, integrations, legal pages in both languages, and listed walls. Unlisted walls aren't pushed to engines.
- `robots.txt`: app screens and private links are disallowed; `/u/` stays open because wall cards are served from there.
- `/llms.txt`: a plain summary of the product, plans, pages and integrations for AI assistants.
- `manifest.webmanifest`, `apple-icon`, and a not-found page that points back to The Wall and integrations.

## IndexNow

After each deploy, CI runs `scripts/seo/indexnow.ts`, which reads the live
sitemap and submits its addresses to IndexNow (Bing, Yandex, Seznam, Naver).
The key in `src/presentation/seo/indexnow.ts` is public by design and served
from `public/<key>.txt`; a test checks the two match. A refusal doesn't fail
the deploy.

## Not done here

- Google Search Console and Bing Webmaster verification: they need the domain owner's accounts. Add the DNS TXT records, then submit `https://flexwall.lol/sitemap.xml`.
- Localized marketing pages: only the legal pages exist in French.

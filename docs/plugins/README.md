# Plugins

A plugin is a folder under `plugins/` that exports one `definePlugin(...)`. It
can contribute any mix of:

| Contribution | Answers | Guide |
|---|---|---|
| **Connector** | Where does a value come from? | [connectors.md](connectors.md) |
| **Widget** | How is a value shown? | [widgets.md](widgets.md) |
| **Theme** | What does the wall look like? | [themes.md](themes.md) |

Connectors and widgets meet only through **values** (`number`, `series`,
`calendar`, `text`). A connector says "this metric is a number"; a widget says
"this input accepts numbers or series". The editor offers every compatible
pairing. Nobody writes a "Stripe MRR widget": they write a Stripe connector,
and every number widget can show MRR.

## Start one

```bash
bun run new-plugin plausible "Plausible"
bun install
bun test plugins/plausible
bun run dev
```

The script copies [`templates/plugin`](../../templates/plugin), fills in names,
registers the plugin in `apps/web/src/plugins/registry.ts` and adds it to the
app's dependencies. Delete the parts you don't need.

```
plugins/plausible/
├── package.json        @flexwall/plugin-plausible, MIT
├── src/index.tsx       definePlugin({ connectors, widgets, themes })
├── tests/plugin.test.tsx
└── README.md           what it adds, which permissions it needs and why
```

## How plugins run

Plugins are **compiled into the app**, not loaded at runtime. On flexwall.lol a
plugin ships when its pull request is merged. This is deliberate: connectors
run on the server with decrypted credentials, and a runtime loader would give
any plugin a way to read them. Review is the security boundary.

Plugin code runs in two places:

- **Server**: connectors fetch values; widgets render pages, share cards and lock screens.
- **Browser**: the editor renders widgets and draws connector forms from the same objects.

So a plugin must not import Node modules or anything that opens sockets. The
SDK gives connectors everything they need through `ctx`.

## Checklist for a pull request

- [ ] `bun test plugins/<id>` passes, tests are Given / When / Then.
- [ ] `checkPlugins` reports nothing (the template's first test does this).
- [ ] Every network call goes through `ctx.fetch`.
- [ ] Credentials are the least privilege the provider offers, and the README says which.
- [ ] `sample` values are plausible and cover every metric.
- [ ] Widgets pass `satoriProblems` at every size they allow.
- [ ] User-facing text is short, plain and in sentence case.

## Ideas wanted

Revenue: Lemon Squeezy, Polar, Paddle, Gumroad. Audience: YouTube, Bluesky,
Mastodon, newsletter platforms. Open source: npm, PyPI, crates.io, Docker Hub.
Analytics: Plausible, Umami, Fathom. Health, reading, chess ratings: anything
people are proud of and can prove.

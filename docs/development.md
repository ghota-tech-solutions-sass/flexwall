# Development

## Setup

```bash
bun install
bun run dev            # apps/web on http://localhost:3000
```

Without configuration the app uses an in-memory store, prints sign-in links in
the server console (and on the sign-in page), and turns payments off. Set
`NEXT_PUBLIC_APP_URL` if you run on another port, so links point back to it.

| Command | What |
|---|---|
| `bun run test` | SDK, plugins and app tests |
| `bun test plugins/<id>` | One plugin |
| `bun run typecheck` | TypeScript across the app and SDK |
| `bun run check` | Typecheck, tests, production build, functional tests on the standalone server |
| `bun run new-plugin <id>` | Scaffold a plugin |

To run the persistence tests against Firestore instead of memory:

```bash
docker run -d --name fw-firestore -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators \
  gcloud beta emulators firestore start --host-port=0.0.0.0:8080
FIRESTORE_EMULATOR_HOST=localhost:8080 GOOGLE_PROJECT_ID=demo-flexwall bun --cwd apps/web test tests/infrastructure
```

## The app, in layers

`apps/web/src` follows a clean architecture. Dependencies point inwards.

```
domain/           entities and rules: User, Wall, Tile, Binding, Handle, entitlements, layout
   ↑
application/      ports (interfaces) and one use case per action
   ↑
infrastructure/   adapters: Firestore/memory repositories, guarded fetch, AES, HMAC, Gmail, Stripe
presentation/     HTTP glue: error → status, session, JSON parsing
rendering/        TileBody (one tile for every surface), Satori images, demo samples
components/       React UI; editor logic lives in components/editor/editor-model.ts
app/              Next.js routes: thin controllers calling use cases
composition.ts    the composition root: picks adapters, builds use cases
plugins/          registry of installed plugins, catalog
```

- **Domain** imports nothing from Next, Firestore or Stripe. It knows plugins only through the `Catalog` interface.
- **Use cases** are classes with their dependencies in the constructor and one `execute` method. They throw `DomainError` with a code and a sentence.
- **Controllers** read the request, call one use case, answer. `presentation/http.ts` maps error codes to statuses.
- **Components** keep logic out: the editor calls pure functions in `editor-model.ts`, which are tested.

Adding a feature usually means: a rule in `domain/`, a use case in
`application/use-cases/`, a port if it needs the outside world, an adapter in
`infrastructure/`, wiring in `composition.ts`, a route, then UI.

## Tests

Every test is **Given / When / Then**, in the name and in the body:

```ts
test("given a handle someone owns, when another user claims it, then they're told it's taken", async () => {
  // Given
  const { users, claimHandle } = setup();
  await users.save(aUser().withId("u1").withHandle(null).build());
  await claimHandle.execute({ userId: "u1", handle: "ada" });

  // When
  const attempt = claimHandle.execute({ userId: "u2", handle: "ADA" });

  // Then
  await expect(attempt).rejects.toMatchObject({ code: "handle_taken" });
});
```

| Folder | Tests | With |
|---|---|---|
| `apps/web/tests/domain` | Pure rules | Builders |
| `apps/web/tests/use-cases` | One file per use case group | Builders, in-memory fakes, a scripted test plugin |
| `apps/web/tests/infrastructure` | Real adapters | Memory store or Firestore emulator |
| `apps/web/tests/editor` | Editor model | Builders |
| `apps/web/tests/functional` | The built standalone server over HTTP | `bun run check` |
| `plugins/*/tests` | Each plugin | `@flexwall/sdk/testing` |

### Builders

`apps/web/tests/builders` has a fluent builder per entity. Defaults describe a
valid, boring object; a test states only what it's about.

```ts
aUser().withId("u1").pro().inTimeZone("Asia/Tokyo").build();
aWall().ownedBy(owner).listed().with(aTile().stat({ label: "MRR" }).metric("stripe", "mrr", { connection: "c1" })).build();
aConnection().ownedBy(owner).forConnector("stripe").build();
aWall().with(…).draft();   // the editor payload that would produce this wall
```

### Fakes

`apps/web/tests/fakes` has an in-memory implementation of every port
(`InMemoryUsers`, `FixedClock`, `TransparentSecretBox`, `FakePayments`, …) and
`testCatalog()`, which installs connectors whose answers a test scripts:
succeed, fail, hang, or refuse with an owner-facing error.

## Conventions

- TypeScript strict, no `any` except where a generic is erased on purpose.
- Comments explain why, not what.
- User-facing text: sentence case, plain verbs, errors say what happened and how to fix it.
- `AGENTS.md` and `CLAUDE.md` in `apps/web` are written by `next dev` for AI coding agents and are git-ignored.

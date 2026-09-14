# Contributing

Thanks for helping. The most useful contributions are **plugins**: a connector
for a service people use, or a widget that shows values in a new way.

## Before you start

- For a plugin, check open issues and pull requests so two people don't write the same connector.
- For changes to the app itself, open an issue first describing the problem. It saves you a pull request that doesn't fit.

## Plugins

```bash
bun run new-plugin <id> "Display Name"
bun install
bun test plugins/<id>
```

Follow [docs/plugins](docs/plugins/README.md) and its checklist. Plugins are MIT.

## The app

Read [docs/development.md](docs/development.md): the layers, where a change
goes, and how tests are written (Given / When / Then, with builders and fakes).
The app is AGPL-3.0; by contributing you agree your contribution is licensed
under the license of the folder you change.

## Pull requests

- One topic per pull request.
- `bun run check` passes.
- New behaviour has tests; bug fixes have a test that failed before.
- User-facing text is short and plain, in sentence case.
- Describe what changed and why, and how you checked it.

## Security issues

Don't open an issue. See [SECURITY.md](SECURITY.md).

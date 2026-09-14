## What and why

<!-- What changed, and the problem it solves. -->

## How I checked it

<!-- Tests added, commands run, screenshots for UI or rendering changes. -->

## Checklist

- [ ] `bun run check` passes
- [ ] Tests are Given / When / Then
- [ ] For connectors: every request goes through `ctx.fetch`
- [ ] For connectors: credentials are the least privilege available, and the plugin README says which
- [ ] For widgets: `satoriProblems` is empty at every allowed size
- [ ] No secrets in `public`, labels, errors or logs

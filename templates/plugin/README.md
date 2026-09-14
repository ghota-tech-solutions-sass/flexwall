# __NAME__

A Flexwall plugin.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `__ID__` | … |
| Widget | `__ID__-big-number` | … |

## Credentials and permissions

This connector reads public data and needs no account. If yours needs one, say
exactly which permissions to grant, and why each is needed.

## Develop

```bash
bun test plugins/__ID__
bun run dev   # the plugin is registered in apps/web/src/plugins/registry.ts
```

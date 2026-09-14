# GitHub

Public GitHub numbers. No account needed.

| Metric | Type | Source |
|---|---|---|
| `streak`, `contributions`, `activity` | number, number, calendar | `github.com/users/<user>/contributions`, one page for all three |
| `followers` | number | `api.github.com/users/<user>` |
| `stars` | number | `api.github.com/repos/<owner>/<repo>` |

## Limits

The REST API allows 60 requests an hour per server IP without a token. Set
`GITHUB_TOKEN` (a token with no scopes) on the server to get 5000. Values stay
fresh for an hour.

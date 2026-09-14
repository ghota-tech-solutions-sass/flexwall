# PyPI

Download counts of public PyPI packages, from [pypistats.org](https://pypistats.org/api/).

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `pypi` | Downloads of one package, by name |

| Metric | Type | What |
|---|---|---|
| `last-day-downloads` | number, count | Downloads on the last day pypistats has counted. |
| `weekly-downloads` | number, count | Downloads over the last week. Competes on the audience leaderboard. |
| `monthly-downloads` | number, count | Downloads over the last month. |

All three come from a single request,
`https://pypistats.org/api/packages/<package>/recent`, shared by every tile
showing the same package. Counts exclude known mirrors.

PyPI names ignore case and treat `-`, `_` and `.` alike, so `Flask_SQLAlchemy`,
`flask.sqlalchemy` and `flask-sqlalchemy` are the same package. The connector
normalizes the name (PEP 503) before asking, and tiles with any spelling share
one request.

## Credentials and permissions

None. Download counts are public and need no PyPI account or token.

## Rate limits

pypistats.org runs on limited resources and limits requests per IP. Its data
updates once a day, and it asks callers to cache and not fetch the same
endpoint more than once a day. Values stay fresh for 12 hours.

An unknown package shows "PyPI has no package called …". A rate limit or an
outage is passed to the host, which keeps the last good value.

## Develop

```bash
bun test plugins/pypi
```

# Your API

A number or a line of text from any HTTPS endpoint that answers JSON. Pro.

Data receives an “API verified” badge after a successful response. Its disclosure
shows only the configured hostname, never the URL path, query, port or credentials.
This confirms the API response, not independent accuracy or account ownership;
connected-account verification remains a separate badge.

## Credentials

The URL, a path to the value (`data.mrr`, `items[0].count`) and an optional
header. The URL and header are stored encrypted, because URLs often carry
tokens; the owner sees only the host and path.

## Safety

Requests go through the host's guarded fetch: private and cloud metadata
addresses are refused at connect time, redirects aren't followed, responses are
capped. Values stay fresh for 10 minutes.

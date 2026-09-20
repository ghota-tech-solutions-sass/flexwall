# Google Analytics 4

Users, visits (sessions), pageviews and daily visits for the last 30 complete days.
Unique users come from the period report, never a sum of daily users. Today is
excluded to avoid comparing a partial day with complete days.

Connect using a numeric GA4 property ID and a dedicated service-account JSON key.
Enable the Analytics Data API and grant that service-account email Viewer access
to the selected GA4 property. Credentials are encrypted by the host; only the
property ID is public connection metadata. No Google Cloud project-level IAM role
or domain-wide delegation is required. Tokens request analytics.readonly only.
The endpoints are fixed to Google, regardless of URLs contained in the JSON key.

This integration uses service accounts, not a Google sign-in button.
Live validation requires a real GA4 property and its credentials.

References:
- https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- https://developers.google.com/identity/protocols/oauth2/service-account

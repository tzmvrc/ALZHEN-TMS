# Supabase connectivity failure — 2026-10-24

Project: `hdmknewarynwpbrhfgai` (ALZHEN TMS DATABASE), region `ap-southeast-1`.

## Observations for provider support

- The backend's Supabase Auth client reports upstream HTTP **522** during sign-in.
- A direct GET of `/auth/v1/health` times out after ten seconds.
- A direct REST read of a single trip ID times out after ten seconds.
- The connected SQL API cannot execute `SELECT 1`; it returns `Connection terminated due to connection timeout`.
- The user confirmed the same trivial SQL fails in the dashboard SQL Editor, including after restarting the database.
- The management API reports `ACTIVE_HEALTHY` despite these data-plane failures.
- No live trip records were created or altered during these availability checks.

Please investigate the project's origin reachability, database health and connection/resource saturation, recovery/startup state and edge routing. No account password, API secret or access token is included in this report.

Cloudflare documents 522 as a timeout contacting the origin: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/.

Supabase documents the SQL connection error here: https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout.

A Management API incident is listed at https://status.supabase.com/incidents/01M5J8ZQ04EZXAYF10Q75MGC1T. It may be relevant to control-plane symptoms; a causal link to this project's Auth/REST failures has not been established.

## Application changes

Login maps upstream service outages to a bounded 503 message; invalid credentials retain their 401 response. No authentication check is bypassed. User maintenance and master image cleanup now back polling off from 15 seconds to a maximum of five minutes during service failures, log once per outage, and resume normal polling after recovery. Existing durable queue claims, leases, ownership checks, completion acknowledgements and per-job retry behavior are preserved.

`shared_confirmation_configured: false` is a deletion rate-protection diagnostic. The code supports local protection with `workers: 1`; shared Redis protection is required for multiple workers. This field is unrelated to the Auth 522.

# ALZHEN TMS MCP server

The MCP service is separate from Vite and the Express backend. It listens on `127.0.0.1:3001`, exposes Streamable HTTP at `/mcp`, and reads data only through existing authenticated backend API routes. It does not connect to the database. The old `frontend/mcp-server.js` is retained as an unused reference; `npm run mcp` does not start it.

## Local setup

From the repository root:

```powershell
npm --prefix mcp ci
Copy-Item mcp/.env.example mcp/.env
```

Edit `mcp/.env`:

- `MCP_BACKEND_URL`: the local Express origin. Use `http://127.0.0.1:5000`, or `http://127.0.0.1:5001` if your backend is configured for 5001.
- `MCP_ALLOWED_HOSTS`: comma-separated exact hostnames accepted in Host and Origin headers. Include `localhost`, `127.0.0.1`, and the current tunnel hostname; do not include schemes, ports, paths, or wildcards. When a Quick Tunnel URL changes, update this and `MCP_PUBLIC_URL`, then restart MCP.
- `MCP_PUBLIC_URL`: the permanent HTTPS origin of your Cloudflare Tunnel, such as `https://tms-mcp.example.com`. Do not include `/mcp` or a trailing slash.
- `MCP_OAUTH_CLIENT_ID`: the public client ID you configure for this ChatGPT connection, for example `alzhen-chatgpt`. This is an identifier, not a password.
- `MCP_OAUTH_REDIRECT_URI`: the **exact** ChatGPT OAuth callback shown in the connection setup. The example uses ChatGPT's stable callback for servers with issuer identification. If ChatGPT displays a different callback, replace it with that value. It must be HTTPS; the authorization server allows only this callback.
- `MCP_SUPABASE_URL` and `MCP_SUPABASE_ANON_KEY`: copy the Supabase URL and **publishable/anon** key used by the frontend. These are used only by the local MCP process to refresh the signed-in user's access token. Service-role and secret keys are rejected.

Start the Express backend in its own terminal, then from the repository root:

```powershell
npm run mcp
```

`http://localhost:3001/health` returns service status. It can be healthy while OAuth is unconfigured. `/mcp` fails closed with `503` until the OAuth settings are complete. After configuration, unauthenticated `/mcp` requests return `401` with protected-resource metadata. The app uses the existing ADMIN/STAFF sign-in; TRUCKER accounts cannot use these tools. Each data read goes to an existing backend route that rechecks the user's role, app session, and device session. The MCP process keeps the user's backend tokens only in memory; ChatGPT receives short-lived opaque MCP access and refresh tokens. Restarting MCP invalidates the connection's in-memory tokens and requires reconnecting.

The backend's ADMIN/STAFF daily session ends at Manila midnight. At that point the MCP connection must be reauthorized by signing in again. Supabase access tokens are renewed while the app session remains valid.

## Cloudflare Tunnel and ChatGPT

1. Create a **named** Cloudflare Tunnel with a stable public hostname. Route that hostname to `http://localhost:3001`. Keep the Express backend and Vite frontend off this tunnel. Cloudflare documents the [published application route](https://developers.cloudflare.com/tunnel/get-started/).
2. Put the hostname in `MCP_PUBLIC_URL`, and configure the predefined public OAuth client ID and exact ChatGPT callback URL in `mcp/.env`. Restart `npm run mcp` after editing the file.
3. In ChatGPT's custom MCP connection setup, enter `https://your-hostname/mcp` and choose OAuth with the same predefined client ID. The server publishes `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` for discovery. The account holder signs in on the ALZHEN page served at `/oauth/authorize`; the password goes to the local ALZHEN backend and is never included in an MCP tool response or token.
4. Connect and review the five read-only tools. Do not publish the connection to other workspace users unless those users are intended to have ALZHEN access.

ChatGPT requires a reachable HTTPS endpoint and its plan/workspace must permit custom MCP connections. See [OpenAI's current connection instructions](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). A Quick Tunnel changes its URL each run, which breaks the fixed OAuth issuer and callback setup; use a stable named tunnel. Do not configure Cloudflare to cache `/mcp`, `/oauth/*`, or `/.well-known/*` responses.

## Tools and limits

| Tool | Existing backend route |
| --- | --- |
| `list_dispatches` | `GET /api/trips/master-list/dispatches` |
| `get_dispatch_details` | `GET /api/trips/master-list/dispatches/:number/children` |
| `get_trip_details` | `GET /api/trips/:id` and `GET /api/trips/:id/convoy` |
| `list_trucks` | `GET /api/lookups/trucks` |
| `get_delivery_status` | `GET /api/trips/:id/stops`; `GET /api/trips/:id/line-items` only when stop DR numbers are missing |

The default tool page is 10 records, capped by `MCP_MAX_PAGE_SIZE` (default 20, hard maximum 50). Detail arrays are capped by `MCP_MAX_DETAIL_ITEMS` (default 50, hard maximum 100); long stop lists can be paged. The truck lookup can page only within the backend's existing lookup window. Backend responses over 3 MB and requests taking over 15 seconds fail instead of sending a large dataset to ChatGPT.

This service has no write tools. It does not start or expose the frontend, backend, Supabase service-role credentials, or database connections.

# AI access — read when touching `apps/mcp` or `docs/ai-guide.md`

`apps/mcp` is an MCP server. It lets an outside AI (Claude, Grok, ChatGPT) read and
change the CRM with a normal CRM API key or an OAuth sign-in.

- **It holds no data and no business logic.** Every tool is one call (rarely two) to
  the REST bridge at `/rest/*`. Validation, permissions and side effects (push
  notifications, follow-up clocks) stay in the API.
- **The caller's credential is the identity.** The server reads `x-api-key` or
  `Authorization: Bearer`. A bearer value with the `crm_` prefix is an API key; any
  other bearer value is an OAuth access token. It forwards the credential and stores
  nothing. Writes are attributed to the user that owns the key or signed in.
- **OAuth comes from Better Auth's `mcp` plugin** (`packages/auth/src/oauth-provider.ts`,
  constants in `oauth-paths.ts`). Dynamic client registration is open, so every
  `/mcp/authorize` is forced to `prompt=consent`: a signed-in user always sees the
  "Allow" page at `/oauth/consent`. Without that, any registered client collects a
  code from a signed-in browser with one link. PKCE is required.
- **Discovery:** an unauthenticated `/mcp` answers 401 with
  `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`.
  The MCP server serves that document. It names the site origin as the authorization
  server, and the reverse proxy sends `/.well-known/oauth-authorization-server` to
  `/api/auth/.well-known/oauth-authorization-server`.
- **The API accepts the access token only from the MCP server.** `createBaseTrpcContext`
  turns `Authorization: Bearer` into a session through `getMcpSession`, but only when
  the request also carries `x-crm-mcp-secret` equal to `MCP_SERVER_SECRET`. A token
  sent straight to `/rest` is refused, so an allowed app reaches only the curated
  tools and never a purge. Without the secret, OAuth is off and API keys still work.
  Session-only procedures (API keys, connected apps) refuse a bearer token, like an
  API key.
- **The MCP server checks an OAuth token before every request.** It answers 401
  `invalid_token` when the token is expired or revoked, so the client refreshes or
  signs in again. Access tokens last an hour, refresh tokens 30 days.
- **Settings → General → Connected AI apps** lists the apps a user allowed and
  disconnects them. Disconnect deletes their tokens and consent.
- **Stateless.** One `McpServer` and transport per request, `sessionIdGenerator:
  undefined`, JSON responses. A restart loses nothing.
- **No purge tool.** Archive and restore only. Permanent deletion stays a human action
  in the app.
- **Shared rules come from `@crm/db`.** Stage labels, losing stages, currency minor
  units and the follow-up rule (`@crm/db/follow-up`) are the same code the board uses.
- **`docs/ai-guide.md` is product, not developer documentation.** It is bundled into
  the server, served at `/mcp/guide`, returned by the `crm_guide` tool and exposed as
  the `crm://guide` resource. Change it when a tool, a stage or a rule changes.
- **Configuration:** `MCP_SERVER_HOST`, `MCP_SERVER_PORT` and `MCP_SERVER_API_URL`
  (see `.env.example`). Defaults: `127.0.0.1`, `3002`, `http://127.0.0.1:3001`. The
  public address in the OAuth metadata is `API_URL`.
- **Routing:** the reverse proxy sends `/mcp` and `/.well-known/oauth-protected-resource`
  to the MCP server. `/mcp/health` answers
  `{ "ok": true }`.
- **`docs/skills/7crawl-crm/SKILL.md` is the skill for AI assistants** that use these
  tools: workflows, business rules and answer formats. `7crawl-crm.skill` is the same
  file zipped for upload to Claude. Rebuild the zip and update both when a tool or a
  rule changes.

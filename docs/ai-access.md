# AI access — read when touching `apps/mcp` or `docs/ai-guide.md`

`apps/mcp` is an MCP server. It lets an outside AI (Claude, Grok, ChatGPT) read and
change the CRM with a normal CRM API key.

- **It holds no data and no business logic.** Every tool is one call (rarely two) to
  the REST bridge at `/rest/*`. Validation, permissions and side effects (push
  notifications, follow-up clocks) stay in the API.
- **The caller's key is the identity.** The server reads `x-api-key` or
  `Authorization: Bearer` and forwards it. It stores no key. Writes are attributed to
  the user that owns the key.
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
  (see `.env.example`). Defaults: `127.0.0.1`, `3002`, `http://127.0.0.1:3001`.
- **Routing:** the reverse proxy sends `/mcp` to the MCP server. `/mcp/health` answers
  `{ "ok": true }`.

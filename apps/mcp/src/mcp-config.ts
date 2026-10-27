export const MCP = {
	server: { name: "7crawl-crm", version: "1.0.0" },
	paths: {
		mcp: "/mcp",
		guide: "/mcp/guide",
		health: "/mcp/health",
		protectedResource: "/.well-known/oauth-protected-resource",
	},
	resourceName: "7crawl CRM",
	scopes: ["openid", "profile", "email", "offline_access"],
	guideUri: "crm://guide",
	restPrefix: "/rest",
	defaults: {
		host: "127.0.0.1",
		port: 3002,
		apiUrl: "http://127.0.0.1:3001",
		publicUrl: "http://localhost:3001",
	},
	requestTimeoutMs: 30_000,
	pageSize: { default: 25, max: 100 },
	timelineLimit: { default: 20, max: 100 },
} as const;

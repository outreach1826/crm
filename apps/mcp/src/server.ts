import { API_KEY_HEADER } from "@crm/auth/api-keys";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpConfig } from "./config";
import { isLiveOAuthToken, readCredential } from "./credentials";
import { MCP } from "./mcp-config";
import { CrmClient } from "./rest-client";
import { registerTools } from "./tools";

function resourceMetadataUrl(config: McpConfig): string {
	return `${config.publicUrl}${MCP.paths.protectedResource}${MCP.paths.mcp}`;
}

function protectedResource(config: McpConfig): Response {
	return Response.json(
		{
			resource: `${config.publicUrl}${MCP.paths.mcp}`,
			authorization_servers: [config.publicUrl],
			scopes_supported: MCP.scopes,
			bearer_methods_supported: ["header"],
			resource_name: MCP.resourceName,
		},
		{ headers: { "access-control-allow-origin": "*" } },
	);
}

function unauthorized(config: McpConfig, invalidToken: boolean): Response {
	const challenge = [
		"Bearer",
		`resource_metadata="${resourceMetadataUrl(config)}"`,
		...(invalidToken ? ['error="invalid_token"'] : []),
	].join(" ");
	return Response.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32001,
				message: invalidToken
					? "The sign-in expired or was revoked. Connect the AI app again."
					: `Sign in with OAuth, or send a CRM API key in the ${API_KEY_HEADER} header.`,
			},
			id: null,
		},
		{
			status: 401,
			headers: {
				"www-authenticate": challenge,
				"access-control-expose-headers": "WWW-Authenticate",
			},
		},
	);
}

function createServer(crm: CrmClient, guide: string): McpServer {
	const server = new McpServer(MCP.server, {
		instructions:
			"Tools for the 7crawl CRM: companies, contacts, deals, activities and tasks. Call crm_guide once before you change anything. Start with pipeline_overview for the state of the business.",
	});

	server.registerResource(
		"guide",
		MCP.guideUri,
		{
			title: "7crawl CRM guide",
			description: "How the CRM works and how to use every tool.",
			mimeType: "text/markdown",
		},
		async (uri) => ({
			contents: [{ uri: uri.href, mimeType: "text/markdown", text: guide }],
		}),
	);

	registerTools(server, crm, guide);
	return server;
}

export function createHandler(options: {
	config: McpConfig;
	guide: string;
	fetch: typeof fetch;
}): (request: Request) => Promise<Response> {
	const { config } = options;

	return async (request) => {
		const { pathname } = new URL(request.url);

		if (pathname === MCP.paths.health) return Response.json({ ok: true });

		if (pathname === MCP.paths.guide) {
			return new Response(options.guide, {
				headers: { "content-type": "text/markdown; charset=utf-8" },
			});
		}

		if (pathname.startsWith(MCP.paths.protectedResource)) {
			return protectedResource(config);
		}

		if (pathname !== MCP.paths.mcp) {
			return new Response("Not found", { status: 404 });
		}

		const credential = readCredential(request.headers);
		if (!credential) return unauthorized(config, false);

		if (credential.kind === "oauth") {
			if (!config.bridgeSecret) return unauthorized(config, true);
			const live = await isLiveOAuthToken({
				apiUrl: config.apiUrl,
				token: credential.value,
				fetch: options.fetch,
			}).catch(() => false);
			if (!live) return unauthorized(config, true);
		}

		const crm = new CrmClient({
			apiUrl: config.apiUrl,
			credential,
			bridgeSecret: config.bridgeSecret,
			fetch: options.fetch,
		});
		const server = createServer(crm, options.guide);
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.connect(transport);
		return transport.handleRequest(request);
	};
}

import { API_KEY_HEADER } from "@crm/auth/api-keys";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpConfig } from "./config";
import { MCP } from "./mcp-config";
import { CrmClient } from "./rest-client";
import { registerTools } from "./tools";

const BEARER = /^Bearer\s+(.+)$/i;

export function readApiKey(headers: Headers): string | null {
	const direct = headers.get(API_KEY_HEADER)?.trim();
	if (direct) return direct;
	const bearer = BEARER.exec(headers.get("authorization") ?? "")?.[1]?.trim();
	return bearer || null;
}

function unauthorized(): Response {
	return Response.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32001,
				message: `Send a CRM API key in the ${API_KEY_HEADER} header or as Authorization: Bearer <key>.`,
			},
			id: null,
		},
		{ status: 401, headers: { "www-authenticate": "Bearer" } },
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
	return async (request) => {
		const { pathname } = new URL(request.url);

		if (pathname === MCP.paths.health) return Response.json({ ok: true });

		if (pathname === MCP.paths.guide) {
			return new Response(options.guide, {
				headers: { "content-type": "text/markdown; charset=utf-8" },
			});
		}

		if (pathname !== MCP.paths.mcp) {
			return new Response("Not found", { status: 404 });
		}

		const apiKey = readApiKey(request.headers);
		if (!apiKey) return unauthorized();

		const crm = new CrmClient({
			apiUrl: options.config.apiUrl,
			apiKey,
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

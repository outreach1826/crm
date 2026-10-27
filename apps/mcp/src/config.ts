import { OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
import { z } from "zod";
import { MCP } from "./mcp-config";

const envSchema = z.object({
	MCP_SERVER_HOST: z.string().min(1).default(MCP.defaults.host),
	MCP_SERVER_PORT: z.coerce
		.number()
		.int()
		.positive()
		.default(MCP.defaults.port),
	MCP_SERVER_API_URL: z.url().default(MCP.defaults.apiUrl),
	MCP_SERVER_SECRET: z
		.string()
		.min(OAUTH_PROVIDER.bridge.minSecretLength)
		.optional(),
	API_URL: z.url().default(MCP.defaults.publicUrl),
});

export type McpConfig = {
	host: string;
	port: number;
	apiUrl: string;
	publicUrl: string;
	bridgeSecret: string | null;
};

export function readConfig(env: Record<string, string | undefined>): McpConfig {
	const parsed = envSchema.parse(env);
	return {
		host: parsed.MCP_SERVER_HOST,
		port: parsed.MCP_SERVER_PORT,
		apiUrl: parsed.MCP_SERVER_API_URL.replace(/\/+$/, ""),
		publicUrl: parsed.API_URL.replace(/\/+$/, ""),
		bridgeSecret: parsed.MCP_SERVER_SECRET ?? null,
	};
}

import "@crm/env/load";
import guide from "../../../docs/ai-guide.md" with { type: "text" };
import { readConfig } from "./config";
import { createHandler } from "./server";

const config = readConfig(process.env);
const handle = createHandler({ config, guide, fetch });

const server = Bun.serve({
	hostname: config.host,
	port: config.port,
	fetch: handle,
});

console.log(`MCP server listening on http://${server.hostname}:${server.port}`);

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { readConfig } from "../src/config";
import { readCredential } from "../src/credentials";
import type { Json } from "../src/rest-client";
import { createHandler } from "../src/server";

type Sent = {
	method: string;
	url: URL;
	key: string | null;
	authorization: string | null;
	bridge: string | null;
	body: Json;
};

const KEY = "crm_test_key";
const BRIDGE_SECRET = "bridge-secret-for-tests-0123456789";
const NOW = Date.now();
const DAY = 86_400_000;

function fakeApi(
	answer: (sent: Sent) => Response = () => Response.json({}),
	env: Record<string, string> = { MCP_SERVER_SECRET: BRIDGE_SECRET },
) {
	const sent: Sent[] = [];
	const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		const call = {
			method: init?.method ?? "GET",
			url: new URL(String(input)),
			key: new Headers(init?.headers).get("x-api-key"),
			authorization: new Headers(init?.headers).get("authorization"),
			bridge: new Headers(init?.headers).get("x-crm-mcp-secret"),
			body,
		};
		sent.push(call);
		return answer(call);
	};
	const handle = createHandler({
		config: readConfig({ API_URL: "https://crm.example", ...env }),
		guide: "# Guide",
		fetch: Object.assign(fetcher, { preconnect: fetch.preconnect }),
	});
	return { sent, handle };
}

const rpcResult = z.object({
	result: z.object({
		tools: z.array(z.object({ name: z.string() })).optional(),
		content: z
			.array(z.object({ type: z.string(), text: z.string() }))
			.optional(),
		isError: z.boolean().optional(),
	}),
});

async function rpc(
	handle: (request: Request) => Promise<Response>,
	method: string,
	params: Json = {},
	auth: Record<string, string> | null = { "x-api-key": KEY },
) {
	const headers = new Headers({
		"content-type": "application/json",
		accept: "application/json, text/event-stream",
	});
	for (const [name, value] of Object.entries(auth ?? {})) {
		headers.set(name, value);
	}
	const response = await handle(
		new Request("http://127.0.0.1:3002/mcp", {
			method: "POST",
			headers,
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		}),
	);
	return response;
}

async function callTool(
	handle: (request: Request) => Promise<Response>,
	name: string,
	args: Json,
) {
	const response = await rpc(handle, "tools/call", { name, arguments: args });
	const { result } = rpcResult.parse(await response.json());
	return {
		text: result.content?.[0]?.text ?? "",
		isError: result.isError ?? false,
	};
}

describe("the MCP server", () => {
	it("answers the health check without a key", async () => {
		const { handle } = fakeApi();
		const response = await handle(
			new Request("http://127.0.0.1:3002/mcp/health"),
		);
		expect(response.status).toBe(200);
	});

	it("serves the guide without a key", async () => {
		const { handle } = fakeApi();
		const response = await handle(
			new Request("http://127.0.0.1:3002/mcp/guide"),
		);
		expect(await response.text()).toBe("# Guide");
	});

	it("refuses a request without a key", async () => {
		const { handle, sent } = fakeApi();
		const response = await rpc(handle, "tools/list", {}, null);
		expect(response.status).toBe(401);
		expect(sent).toHaveLength(0);
	});

	it("lists read and write tools and no purge tool", async () => {
		const { handle } = fakeApi();
		const response = await rpc(handle, "tools/list");
		const names = rpcResult
			.parse(await response.json())
			.result.tools?.map((tool) => tool.name);
		expect(names).toContain("pipeline_overview");
		expect(names).toContain("create_deal");
		expect(names).toContain("archive_record");
		expect(names?.some((name) => name.includes("purge"))).toBe(false);
		expect(names?.some((name) => name.includes("delete"))).toBe(false);
	});

	it("forwards the caller's key and converts whole amounts to minor units", async () => {
		const { handle, sent } = fakeApi(() => Response.json({ id: "deal_1" }));
		const result = await callTool(handle, "create_deal", {
			name: "Web corpus",
			companyId: "co_1",
			ownerId: "user_1",
			amount: 12500.5,
		});
		expect(result.isError).toBe(false);
		expect(sent[0]?.url.pathname).toBe("/rest/deals");
		expect(sent[0]?.key).toBe(KEY);
		expect(sent[0]?.body).toEqual({
			name: "Web corpus",
			companyId: "co_1",
			ownerId: "user_1",
			currency: "USD",
			amountCents: 1250050,
		});
	});

	it("uses the deal's own currency when an update gives only an amount", async () => {
		const { handle, sent } = fakeApi((call) =>
			Response.json(
				call.method === "GET" ? { currency: "JPY" } : { id: "deal_1" },
			),
		);
		await callTool(handle, "update_deal", { id: "deal_1", amount: 5000 });
		expect(sent[1]?.method).toBe("PATCH");
		expect(sent[1]?.body).toEqual({ data: { amountCents: 5000 } });
	});

	it("sends a JSON body on an archive, which has no input of its own", async () => {
		const { handle, sent } = fakeApi(() => Response.json({ id: "co_1" }));
		const result = await callTool(handle, "archive_record", {
			kind: "company",
			id: "co_1",
		});
		expect(result.isError).toBe(false);
		expect(sent[0]?.url.pathname).toBe("/rest/companies/co_1/archive");
		expect(sent[0]?.body).toEqual({});
	});

	it("asks for a reason before a deal is closed as lost", async () => {
		const { handle, sent } = fakeApi();
		const result = await callTool(handle, "move_deal_stage", {
			id: "deal_1",
			stage: "CLOSED_LOST",
		});
		expect(result.isError).toBe(true);
		expect(sent).toHaveLength(0);
	});

	it("returns the CRM's error message as a tool error", async () => {
		const { handle } = fakeApi(() =>
			Response.json(
				{ message: "That company does not exist." },
				{ status: 404 },
			),
		);
		const result = await callTool(handle, "get_company", { id: "missing" });
		expect(result.isError).toBe(true);
		expect(result.text).toBe("That company does not exist.");
	});

	it("lists the deals that need a follow-up in the pipeline overview", async () => {
		const card = {
			currency: "USD",
			company: { id: "co_1", name: "Lab" },
			owner: { id: "user_1", name: "David" },
			amountCents: 100000,
			expectedCloseDate: null,
			lastActivityAt: null,
		};
		const { handle } = fakeApi(() =>
			Response.json({
				cards: [
					{
						...card,
						id: "quiet",
						name: "Quiet deal",
						stage: "CONTRACT_SENT",
						stageChangedAt: new Date(NOW - 10 * DAY).toISOString(),
					},
					{
						...card,
						id: "fresh",
						name: "Fresh deal",
						stage: "CONTRACT_SENT",
						stageChangedAt: new Date(NOW - DAY).toISOString(),
					},
				],
				columns: [{ stage: "CONTRACT_SENT", count: 2, valueCents: 200000 }],
				truncated: false,
				reportingCurrency: "USD",
				unconverted: { count: 0, currencies: [] },
			}),
		);
		const result = await callTool(handle, "pipeline_overview", {});
		const overview = z
			.object({
				stages: z.array(z.object({ value: z.number().nullable() })),
				needsFollowUp: z.array(z.object({ dealId: z.string() })),
			})
			.parse(JSON.parse(result.text));
		expect(overview.stages[0]?.value).toBe(2000);
		expect(overview.needsFollowUp.map((entry) => entry.dealId)).toEqual([
			"quiet",
		]);
	});
});

describe("signing in with OAuth", () => {
	it("points a client without a key at the sign-in metadata", async () => {
		const { handle } = fakeApi();
		const response = await rpc(handle, "tools/list", {}, null);
		expect(response.headers.get("www-authenticate")).toBe(
			`Bearer resource_metadata="https://crm.example/.well-known/oauth-protected-resource/mcp"`,
		);
	});

	it("describes the protected resource and its authorization server", async () => {
		const { handle } = fakeApi();
		const response = await handle(
			new Request(
				"http://127.0.0.1:3002/.well-known/oauth-protected-resource/mcp",
			),
		);
		expect(await response.json()).toMatchObject({
			resource: "https://crm.example/mcp",
			authorization_servers: ["https://crm.example"],
		});
	});

	it("checks an OAuth token, then forwards it to the CRM", async () => {
		const { handle, sent } = fakeApi((call) =>
			Response.json(
				call.url.pathname.endsWith("/mcp/get-session")
					? { userId: "user_1" }
					: [],
			),
		);
		const response = await rpc(
			handle,
			"tools/call",
			{ name: "list_team", arguments: {} },
			{ authorization: "Bearer oauth-token" },
		);
		expect(response.status).toBe(200);
		expect(sent.map((call) => call.url.pathname)).toEqual([
			"/api/auth/mcp/get-session",
			"/rest/users",
		]);
		expect(sent[1]?.authorization).toBe("Bearer oauth-token");
		expect(sent[1]?.bridge).toBe(BRIDGE_SECRET);
		expect(sent[1]?.key).toBeNull();
	});

	it("refuses OAuth when the server has no bridge secret", async () => {
		const { handle, sent } = fakeApi(() => Response.json({ userId: "u" }), {});
		const response = await rpc(
			handle,
			"tools/list",
			{},
			{ authorization: "Bearer oauth-token" },
		);
		expect(response.status).toBe(401);
		expect(sent).toHaveLength(0);
	});

	it("never sends the bridge secret with an API key", async () => {
		const { handle, sent } = fakeApi(() => Response.json([]));
		await callTool(handle, "list_team", {});
		expect(sent[0]?.key).toBe(KEY);
		expect(sent[0]?.bridge).toBeNull();
	});

	it("answers 401 invalid_token for an expired OAuth token", async () => {
		const { handle, sent } = fakeApi(() => Response.json(null));
		const response = await rpc(
			handle,
			"tools/list",
			{},
			{ authorization: "Bearer expired-token" },
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toContain(
			`error="invalid_token"`,
		);
		expect(sent).toHaveLength(1);
	});
});

describe("readCredential", () => {
	it("reads an API key sent as a bearer token", () => {
		expect(
			readCredential(new Headers({ authorization: "Bearer crm_abc" })),
		).toEqual({ kind: "api-key", value: "crm_abc" });
	});

	it("reads any other bearer token as OAuth", () => {
		expect(
			readCredential(new Headers({ authorization: "Bearer abcdef" })),
		).toEqual({ kind: "oauth", value: "abcdef" });
	});

	it("prefers the x-api-key header", () => {
		expect(
			readCredential(
				new Headers({
					"x-api-key": "crm_one",
					authorization: "Bearer crm_two",
				}),
			),
		).toEqual({ kind: "api-key", value: "crm_one" });
	});

	it("returns null without a credential", () => {
		expect(readCredential(new Headers())).toBeNull();
	});
});

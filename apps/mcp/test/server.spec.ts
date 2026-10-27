import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { readConfig } from "../src/config";
import type { Json } from "../src/rest-client";
import { createHandler, readApiKey } from "../src/server";

type Sent = { method: string; url: URL; key: string | null; body: Json };

const KEY = "crm_test_key";
const NOW = Date.now();
const DAY = 86_400_000;

function fakeApi(answer: (sent: Sent) => Response = () => Response.json({})) {
	const sent: Sent[] = [];
	const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		const call = {
			method: init?.method ?? "GET",
			url: new URL(String(input)),
			key: new Headers(init?.headers).get("x-api-key"),
			body,
		};
		sent.push(call);
		return answer(call);
	};
	const handle = createHandler({
		config: readConfig({}),
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
	key: string | null = KEY,
) {
	const headers = new Headers({
		"content-type": "application/json",
		accept: "application/json, text/event-stream",
	});
	if (key) headers.set("x-api-key", key);
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

describe("readApiKey", () => {
	it("reads a bearer token", () => {
		expect(readApiKey(new Headers({ authorization: "Bearer crm_abc" }))).toBe(
			"crm_abc",
		);
	});

	it("prefers the x-api-key header", () => {
		expect(
			readApiKey(
				new Headers({
					"x-api-key": "crm_one",
					authorization: "Bearer crm_two",
				}),
			),
		).toBe("crm_one");
	});

	it("returns null without a key", () => {
		expect(readApiKey(new Headers())).toBeNull();
	});
});

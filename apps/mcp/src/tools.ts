import { minorUnitsOf } from "@crm/db/currency";
import { DEAL_STAGE_LABELS, LOSING_DEAL_STAGES } from "@crm/db/deal-stage";
import { DealStage } from "@crm/db/enums";
import { needsFollowUp } from "@crm/db/follow-up";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MCP } from "./mcp-config";
import { CrmApiError, type CrmClient, type Json } from "./rest-client";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = {
	readOnlyHint: false,
	destructiveHint: false,
	openWorldHint: false,
} as const;

const id = z.string().min(1);
const stage = z.enum(DealStage);
const recordKind = z.enum(["deal", "company", "contact"]);
const page = z.number().int().min(1).optional();
const pageSize = z
	.number()
	.int()
	.min(1)
	.max(MCP.pageSize.max)
	.optional()
	.describe(`Rows per page. Default ${MCP.pageSize.default}.`);
const ownerIds = z
	.array(id)
	.optional()
	.describe("User ids from list_team. Empty means every owner.");
const archived = z
	.boolean()
	.optional()
	.describe("true lists only archived records. Default false.");
const amount = z
	.number()
	.min(0)
	.describe("Amount in whole currency units, for example 12500 for $12,500.");

const RECORD_PATHS = {
	deal: "/deals",
	company: "/companies",
	contact: "/contacts",
} as const satisfies Record<z.infer<typeof recordKind>, string>;

const LOSING = new Set<DealStage>(LOSING_DEAL_STAGES);

const boardSchema = z.object({
	cards: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			stage,
			currency: z.string(),
			company: z.object({ id: z.string(), name: z.string() }),
			owner: z.object({ id: z.string(), name: z.string() }).nullable(),
			amountCents: z.number().nullable(),
			expectedCloseDate: z.string().nullable(),
			lastActivityAt: z.string().nullable(),
			stageChangedAt: z.string(),
		}),
	),
	columns: z.array(
		z.object({
			stage,
			count: z.number(),
			valueCents: z.number().nullable(),
		}),
	),
	truncated: z.boolean(),
	reportingCurrency: z.string(),
	unconverted: z.object({
		count: z.number(),
		currencies: z.array(z.string()),
	}),
});

const dealCurrency = z.object({ currency: z.string() });

function toMinor(value: number, currency: string): number {
	return Math.round(value * 10 ** minorUnitsOf(currency));
}

function toMajor(value: number | null, currency: string): number | null {
	return value === null ? null : value / 10 ** minorUnitsOf(currency);
}

function ok(data: Json): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function refuse(message: string): CallToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

async function run(action: () => Promise<Json>): Promise<CallToolResult> {
	try {
		return ok(await action());
	} catch (error) {
		if (error instanceof CrmApiError) return refuse(error.message);
		if (error instanceof Error) {
			return refuse(`The CRM did not answer: ${error.message}`);
		}
		return refuse("The CRM did not answer.");
	}
}

function changes<T extends Record<string, Json | undefined>>(
	input: T,
): Record<string, Json> {
	return Object.fromEntries(
		Object.entries(input).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, value]],
		),
	);
}

export function registerTools(
	server: McpServer,
	crm: CrmClient,
	guide: string,
): void {
	server.registerTool(
		"crm_guide",
		{
			title: "Read the CRM guide",
			description:
				"Returns the guide to the 7crawl CRM: what each record means, the deal stages, the follow-up rules and how to use every tool. Read it once before you work in the CRM.",
			annotations: READ,
		},
		async () => ({ content: [{ type: "text", text: guide }] }),
	);

	server.registerTool(
		"pipeline_overview",
		{
			title: "Pipeline overview",
			description:
				"Returns every open and recently closed deal grouped by stage, the count and value of each stage, and the deals that need a follow-up now. Start here to answer 'how is the business doing' or 'what should we do today'.",
			inputSchema: { ownerIds },
			annotations: READ,
		},
		async ({ ownerIds }) =>
			run(async () => {
				const board = boardSchema.parse(
					await crm.call({
						method: "POST",
						path: "/deals/board",
						body: { owner: ownerIds ?? [] },
					}),
				);
				const currency = board.reportingCurrency;
				return {
					reportingCurrency: currency,
					stages: board.columns.map((column) => ({
						stage: column.stage,
						label: DEAL_STAGE_LABELS[column.stage],
						deals: column.count,
						value: toMajor(column.valueCents, currency),
					})),
					needsFollowUp: needsFollowUp(board.cards, Date.now()).map(
						(entry) => ({
							dealId: entry.deal.id,
							deal: entry.deal.name,
							company: entry.deal.company.name,
							stage: DEAL_STAGE_LABELS[entry.deal.stage],
							quietSince: entry.quietSince,
							quietDays: entry.quietDays,
							limitDays: entry.limitDays,
						}),
					),
					deals: board.cards.map((card) => ({
						id: card.id,
						name: card.name,
						stage: card.stage,
						company: card.company.name,
						companyId: card.company.id,
						owner: card.owner?.name ?? null,
						amount: toMajor(card.amountCents, card.currency),
						currency: card.currency,
						expectedCloseDate: card.expectedCloseDate,
						lastActivityAt: card.lastActivityAt,
					})),
					truncated: board.truncated,
					notInTotals: board.unconverted,
				};
			}),
	);

	server.registerTool(
		"find_deals",
		{
			title: "Find deals",
			description:
				"Searches deals by name or company and filters them. Returns one page of deals with their stage, owner, company and amount in minor units (amountCents).",
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe("Words in the deal or company name."),
				status: z.enum(["all", "open", "closed"]).optional(),
				stages: z.array(stage).optional(),
				ownerIds,
				closing: z
					.array(
						z.enum(["overdue", "this-month", "next-month", "later", "none"]),
					)
					.optional()
					.describe("Expected close date windows."),
				archived,
				page,
				pageSize,
			},
			annotations: READ,
		},
		async (input) =>
			run(() =>
				crm.call({
					method: "POST",
					path: "/deals/search",
					body: changes({
						q: input.query,
						status: input.status,
						stage: input.stages,
						owner: input.ownerIds,
						closing: input.closing,
						archived: input.archived,
						page: input.page,
						pageSize: input.pageSize,
					}),
				}),
			),
	);

	server.registerTool(
		"get_deal",
		{
			title: "Get a deal",
			description:
				"Returns one deal with its company, owner, contacts, custom fields, amount and stage history.",
			inputSchema: { id },
			annotations: READ,
		},
		async ({ id }) =>
			run(() =>
				crm.call({ method: "GET", path: `/deals/${encodeURIComponent(id)}` }),
			),
	);

	server.registerTool(
		"find_companies",
		{
			title: "Find companies",
			description:
				"Searches companies by name or domain. Returns one page of companies with owner and counts.",
			inputSchema: {
				query: z.string().optional().describe("Words in the name or domain."),
				ownerIds,
				archived,
				page,
				pageSize,
			},
			annotations: READ,
		},
		async (input) =>
			run(() =>
				crm.call({
					method: "POST",
					path: "/companies/search",
					body: changes({
						q: input.query,
						owner: input.ownerIds,
						archived: input.archived,
						page: input.page,
						pageSize: input.pageSize,
					}),
				}),
			),
	);

	server.registerTool(
		"get_company",
		{
			title: "Get a company",
			description:
				"Returns one company with its details, people, deals and custom fields.",
			inputSchema: { id },
			annotations: READ,
		},
		async ({ id }) =>
			run(() =>
				crm.call({
					method: "GET",
					path: `/companies/${encodeURIComponent(id)}`,
				}),
			),
	);

	server.registerTool(
		"find_contacts",
		{
			title: "Find contacts",
			description:
				"Searches people by name, email or title. Returns one page of contacts with their company and owner.",
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe("Words in the name, email or title."),
				ownerIds,
				archived,
				page,
				pageSize,
			},
			annotations: READ,
		},
		async (input) =>
			run(() =>
				crm.call({
					method: "POST",
					path: "/contacts/search",
					body: changes({
						q: input.query,
						owner: input.ownerIds,
						archived: input.archived,
						page: input.page,
						pageSize: input.pageSize,
					}),
				}),
			),
	);

	server.registerTool(
		"get_contact",
		{
			title: "Get a contact",
			description: "Returns one person with their company, deals and details.",
			inputSchema: { id },
			annotations: READ,
		},
		async ({ id }) =>
			run(() =>
				crm.call({
					method: "GET",
					path: `/contacts/${encodeURIComponent(id)}`,
				}),
			),
	);

	server.registerTool(
		"search_everything",
		{
			title: "Search the whole CRM",
			description:
				"Searches companies, contacts and deals at the same time. Use it when you do not know the kind of record.",
			inputSchema: { query: z.string().min(1) },
			annotations: READ,
		},
		async ({ query }) =>
			run(() =>
				crm.call({ method: "GET", path: "/search", query: { q: query } }),
			),
	);

	server.registerTool(
		"get_timeline",
		{
			title: "Get a timeline",
			description:
				"Returns the notes, calls, emails, meetings and tasks on one company, contact or deal, newest first. Give exactly one of companyId, contactId or dealId. Pass nextCursor from the answer to read older entries.",
			inputSchema: {
				companyId: id.optional(),
				contactId: id.optional(),
				dealId: id.optional(),
				filter: z
					.enum([
						"all",
						"history",
						"notes",
						"upcoming",
						"done",
						"email",
						"meetings",
					])
					.optional(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(MCP.timelineLimit.max).optional(),
			},
			annotations: READ,
		},
		async (input) => {
			const targets = [input.companyId, input.contactId, input.dealId].filter(
				(value) => value !== undefined,
			);
			if (targets.length !== 1) {
				return refuse("Give exactly one of companyId, contactId or dealId.");
			}
			return run(() =>
				crm.call({
					method: "GET",
					path: "/activities",
					query: {
						companyId: input.companyId,
						contactId: input.contactId,
						dealId: input.dealId,
						filter: input.filter,
						cursor: input.cursor,
						limit: input.limit ?? MCP.timelineLimit.default,
					},
				}),
			);
		},
	);

	server.registerTool(
		"list_team",
		{
			title: "List the team",
			description:
				"Returns every user in the workspace with their id. Use these ids as ownerId and ownerIds.",
			annotations: READ,
		},
		async () => run(() => crm.call({ method: "GET", path: "/users" })),
	);

	server.registerTool(
		"my_open_tasks",
		{
			title: "Open tasks",
			description:
				"Returns the open tasks of the user that owns the API key: overdue, upcoming or all.",
			inputSchema: {
				window: z.enum(["overdue", "upcoming", "all"]).optional(),
				limit: z.number().int().min(1).max(MCP.timelineLimit.max).optional(),
			},
			annotations: READ,
		},
		async (input) =>
			run(() =>
				crm.call({
					method: "GET",
					path: "/activities/my-tasks",
					query: { window: input.window, limit: input.limit },
				}),
			),
	);

	server.registerTool(
		"dashboard_summary",
		{
			title: "Dashboard summary",
			description:
				"Returns the dashboard numbers: pipeline value, won and lost totals and recent movement. scope 'everyone' covers the whole team. scope 'me' covers the user that owns the API key.",
			inputSchema: { scope: z.enum(["me", "everyone"]).optional() },
			annotations: READ,
		},
		async ({ scope }) =>
			run(() =>
				crm.call({
					method: "GET",
					path: "/dashboard/summary",
					query: { scope: scope ?? "everyone" },
				}),
			),
	);

	server.registerTool(
		"create_company",
		{
			title: "Create a company",
			description:
				"Adds a company. Search with find_companies first so you do not add a duplicate.",
			inputSchema: {
				name: z.string().min(1),
				domain: z
					.string()
					.optional()
					.describe("Web domain, for example openai.com."),
				ownerId: id.optional(),
			},
			annotations: WRITE,
		},
		async (input) =>
			run(() =>
				crm.call({ method: "POST", path: "/companies", body: changes(input) }),
			),
	);

	server.registerTool(
		"update_company",
		{
			title: "Update a company",
			description:
				"Changes the fields you give on one company. Fields you leave out stay the same. ownerId null removes the owner.",
			inputSchema: {
				id,
				name: z.string().min(1).optional(),
				domain: z.string().optional(),
				website: z.string().optional(),
				description: z.string().optional(),
				industry: z.string().optional(),
				city: z.string().optional(),
				stateCode: z.string().optional(),
				country: z.string().optional(),
				phone: z.string().optional(),
				email: z.string().optional(),
				linkedinUrl: z.string().optional(),
				ownerId: id.nullable().optional(),
			},
			annotations: WRITE,
		},
		async ({ id, ...data }) =>
			run(() =>
				crm.call({
					method: "PATCH",
					path: `/companies/${encodeURIComponent(id)}`,
					body: { data: changes(data) },
				}),
			),
	);

	server.registerTool(
		"create_contact",
		{
			title: "Create a contact",
			description:
				"Adds a person. Without companyId the CRM links the person to the company of their email domain when it knows one.",
			inputSchema: {
				firstName: z.string().min(1),
				lastName: z.string().optional(),
				email: z.email().optional(),
				phone: z.string().optional(),
				title: z.string().optional().describe("Job title."),
				companyId: id.optional(),
				ownerId: id.optional(),
			},
			annotations: WRITE,
		},
		async (input) =>
			run(() =>
				crm.call({ method: "POST", path: "/contacts", body: changes(input) }),
			),
	);

	server.registerTool(
		"update_contact",
		{
			title: "Update a contact",
			description:
				"Changes the fields you give on one person. Fields you leave out stay the same. companyId or ownerId null removes the link.",
			inputSchema: {
				id,
				firstName: z.string().min(1).optional(),
				lastName: z.string().optional(),
				email: z.string().optional(),
				phone: z.string().optional(),
				title: z.string().optional(),
				linkedinUrl: z.string().optional(),
				companyId: id.nullable().optional(),
				ownerId: id.nullable().optional(),
			},
			annotations: WRITE,
		},
		async ({ id, ...data }) =>
			run(() =>
				crm.call({
					method: "PATCH",
					path: `/contacts/${encodeURIComponent(id)}`,
					body: { data: changes(data) },
				}),
			),
	);

	server.registerTool(
		"create_deal",
		{
			title: "Create a deal",
			description:
				"Opens a deal on a company. Every deal needs a company and an owner. The stage starts at Demo booked unless you give one.",
			inputSchema: {
				name: z.string().min(1),
				companyId: id,
				ownerId: id.describe("User id from list_team."),
				stage: stage.optional(),
				amount: amount.optional(),
				currency: z
					.string()
					.length(3)
					.optional()
					.describe("ISO code, for example USD. Default USD."),
				expectedCloseDate: z
					.string()
					.optional()
					.describe("Date as YYYY-MM-DD."),
			},
			annotations: WRITE,
		},
		async ({ amount, currency, ...input }) => {
			const code = (currency ?? "USD").toUpperCase();
			return run(() =>
				crm.call({
					method: "POST",
					path: "/deals",
					body: changes({
						...input,
						currency: code,
						amountCents:
							amount === undefined ? undefined : toMinor(amount, code),
					}),
				}),
			);
		},
	);

	server.registerTool(
		"update_deal",
		{
			title: "Update a deal",
			description:
				"Changes the fields you give on one deal. Fields you leave out stay the same. Use move_deal_stage to change the stage. amount null clears the amount.",
			inputSchema: {
				id,
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
				companyId: id.optional(),
				ownerId: id.optional(),
				amount: amount.nullable().optional(),
				currency: z.string().length(3).optional(),
				expectedCloseDate: z
					.string()
					.nullable()
					.optional()
					.describe("Date as YYYY-MM-DD. null clears it."),
			},
			annotations: WRITE,
		},
		async ({ id, amount, currency, ...data }) =>
			run(async () => {
				const path = `/deals/${encodeURIComponent(id)}`;
				let amountCents: number | null | undefined;
				if (amount === null) amountCents = null;
				if (amount !== undefined && amount !== null) {
					const code =
						currency?.toUpperCase() ??
						dealCurrency.parse(await crm.call({ method: "GET", path }))
							.currency;
					amountCents = toMinor(amount, code);
				}
				return crm.call({
					method: "PATCH",
					path,
					body: {
						data: changes({
							...data,
							currency: currency?.toUpperCase(),
							amountCents,
						}),
					},
				});
			}),
	);

	server.registerTool(
		"move_deal_stage",
		{
			title: "Move a deal to a stage",
			description: `Moves one deal to a new stage. Closed lost and Unqualified need a reason. Stages in order: ${Object.values(DEAL_STAGE_LABELS).join(", ")}.`,
			inputSchema: {
				id,
				stage,
				reason: z
					.string()
					.optional()
					.describe("Why the deal was lost or unqualified."),
			},
			annotations: WRITE,
		},
		async ({ id, stage, reason }) => {
			if (LOSING.has(stage) && !reason?.trim()) {
				return refuse(
					`${DEAL_STAGE_LABELS[stage]} needs a reason. Ask the user why, then call again with reason.`,
				);
			}
			return run(() =>
				crm.call({
					method: "PATCH",
					path: `/deals/${encodeURIComponent(id)}/stage`,
					body: changes({ stage, closedReason: reason?.trim() }),
				}),
			);
		},
	);

	server.registerTool(
		"link_contact_to_deal",
		{
			title: "Add a person to a deal",
			description:
				"Links a contact to a deal, with an optional role such as Champion or Decision maker.",
			inputSchema: {
				dealId: id,
				contactId: id,
				role: z.string().max(80).optional(),
			},
			annotations: WRITE,
		},
		async ({ dealId, contactId, role }) =>
			run(() =>
				crm.call({
					method: "POST",
					path: `/deals/${encodeURIComponent(dealId)}/contacts`,
					body: changes({ contactId, role }),
				}),
			),
	);

	server.registerTool(
		"log_activity",
		{
			title: "Log an activity",
			description:
				"Records a note, call, email or meeting on a company, contact or deal. Logging on a deal resets its follow-up clock.",
			inputSchema: {
				type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]),
				subject: z.string().optional(),
				body: z.string().optional().describe("The note text or a summary."),
				occurredAt: z
					.string()
					.optional()
					.describe("ISO date and time. Default now."),
				companyId: id.optional(),
				contactId: id.optional(),
				dealId: id.optional(),
			},
			annotations: WRITE,
		},
		async (input) =>
			run(() =>
				crm.call({ method: "POST", path: "/activities", body: changes(input) }),
			),
	);

	server.registerTool(
		"create_task",
		{
			title: "Create a task",
			description:
				"Adds a to-do with a due date on a company, contact or deal. The task belongs to the user that owns the API key.",
			inputSchema: {
				subject: z.string().min(1),
				dueAt: z.string().describe("ISO date and time the task is due."),
				body: z.string().optional(),
				companyId: id.optional(),
				contactId: id.optional(),
				dealId: id.optional(),
			},
			annotations: WRITE,
		},
		async (input) =>
			run(() =>
				crm.call({
					method: "POST",
					path: "/activities",
					body: changes({ type: "TASK", ...input }),
				}),
			),
	);

	server.registerTool(
		"complete_task",
		{
			title: "Complete a task",
			description: "Marks a task done. completed false opens it again.",
			inputSchema: { id, completed: z.boolean().optional() },
			annotations: WRITE,
		},
		async ({ id, completed }) =>
			run(() =>
				crm.call({
					method: "PATCH",
					path: `/activities/${encodeURIComponent(id)}/complete`,
					body: { completed: completed ?? true },
				}),
			),
	);

	server.registerTool(
		"archive_record",
		{
			title: "Archive a record",
			description:
				"Moves a deal, company or contact to the archive. Nothing is deleted. restore_record brings it back. Ask the user before you archive.",
			inputSchema: { kind: recordKind, id },
			annotations: { ...WRITE, idempotentHint: true },
		},
		async ({ kind, id }) =>
			run(() =>
				crm.call({
					method: "POST",
					path: `${RECORD_PATHS[kind]}/${encodeURIComponent(id)}/archive`,
				}),
			),
	);

	server.registerTool(
		"restore_record",
		{
			title: "Restore a record",
			description: "Brings an archived deal, company or contact back.",
			inputSchema: { kind: recordKind, id },
			annotations: { ...WRITE, idempotentHint: true },
		},
		async ({ kind, id }) =>
			run(() =>
				crm.call({
					method: "POST",
					path: `${RECORD_PATHS[kind]}/${encodeURIComponent(id)}/restore`,
				}),
			),
	);
}

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deals-board-spec";
const userId = `user-${suffix}`;
const domain = `board-${suffix}.test`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const conversion = new ConversionService(db);

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	conversion,
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

const ids: Record<string, string> = {};

async function clean() {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	const base = await conversion.reportingCurrency();
	const foreign = base === "EUR" ? "GBP" : "EUR";

	await db.user.create({
		data: {
			id: userId,
			name: "Board Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Board Co ${suffix}`, domain },
		select: { id: true },
	});

	const deal = (data: {
		name: string;
		stage: "DEMO_BOOKED" | "CLOSED_WON";
		amount: number;
		currency: string;
		baseAmount: number | null;
		archived?: boolean;
	}) =>
		db.deal.create({
			data: {
				name: data.name,
				stage: data.stage,
				amount: data.amount,
				currency: data.currency,
				baseAmount: data.baseAmount,
				baseCurrency: data.baseAmount === null ? null : base,
				archivedAt: data.archived ? new Date() : null,
				companyId: company.id,
				ownerId: userId,
			},
			select: { id: true },
		});

	ids.converted = (
		await deal({
			name: "Converted",
			stage: "DEMO_BOOKED",
			amount: 100,
			currency: base,
			baseAmount: 100,
		})
	).id;
	ids.unconverted = (
		await deal({
			name: "Unconverted",
			stage: "DEMO_BOOKED",
			amount: 50,
			currency: foreign,
			baseAmount: null,
		})
	).id;
	ids.won = (
		await deal({
			name: "Won",
			stage: "CLOSED_WON",
			amount: 200,
			currency: base,
			baseAmount: 200,
		})
	).id;
	ids.archived = (
		await deal({
			name: "Archived",
			stage: "DEMO_BOOKED",
			amount: 999,
			currency: base,
			baseAmount: 999,
			archived: true,
		})
	).id;
});

afterAll(clean);

describe("DealsService.board", () => {
	it("returns every live deal for the owner and leaves archived ones out", async () => {
		const board = await deals.board({ owner: [userId] });
		const cardIds = board.cards.map((card) => card.id).sort();

		expect(cardIds).toEqual([ids.converted, ids.unconverted, ids.won].sort());
		expect(board.truncated).toBe(false);
	});

	it("has a column for every stage", async () => {
		const board = await deals.board({ owner: [userId] });

		expect(board.columns.map((column) => column.stage)).toEqual([
			"DEMO_BOOKED",
			"QUALIFIED_TO_BUY",
			"DECISION_MAKER_BOUGHT_IN",
			"CONTRACT_SENT",
			"CLOSED_WON",
			"CLOSED_LOST",
			"UNQUALIFIED_TO_BUY",
		]);
	});

	it("counts every deal but sums only converted amounts", async () => {
		const board = await deals.board({ owner: [userId] });
		const column = (stage: string) =>
			board.columns.find((entry) => entry.stage === stage);

		expect(column("DEMO_BOOKED")).toEqual({
			stage: "DEMO_BOOKED",
			count: 2,
			valueCents: 10_000,
		});
		expect(column("CLOSED_WON")).toEqual({
			stage: "CLOSED_WON",
			count: 1,
			valueCents: 20_000,
		});
		expect(column("CONTRACT_SENT")).toEqual({
			stage: "CONTRACT_SENT",
			count: 0,
			valueCents: null,
		});
	});

	it("discloses the deals it could not convert", async () => {
		const board = await deals.board({ owner: [userId] });

		expect(board.unconverted.count).toBe(1);
	});

	it("carries when each deal last moved stage", async () => {
		const board = await deals.board({ owner: [userId] });
		const card = board.cards.find((entry) => entry.id === ids.converted);

		expect(card?.stageChangedAt).toBeString();
		expect(Number.isNaN(Date.parse(card?.stageChangedAt ?? ""))).toBe(false);
	});
});

import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { DealNotifications } from "../src/push/deal-notifications.service";
import type {
	PushAudience,
	PushMessage,
	PushService,
} from "../src/push/push.service";

const suffix = process.env.TEST_RUN_ID ?? "deal-notifications-spec";
const actor = `user-actor-${suffix}`;
const owner = `user-owner-${suffix}`;
const domain = `notify-${suffix}.test`;

const calls: Array<{ audience: PushAudience; message: PushMessage }> = [];

const push = {
	notify: (audience: PushAudience, message: PushMessage) => {
		calls.push({ audience, message });
	},
} as unknown as PushService;

const notifications = new DealNotifications(db, push);

let dealId = "";

async function clean() {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: { in: [actor, owner] } } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: {
			id: actor,
			name: "Ana",
			email: `${actor}@example.test`,
			emailVerified: true,
		},
	});
	await db.user.create({
		data: {
			id: owner,
			name: "Omar",
			email: `${owner}@example.test`,
			emailVerified: true,
		},
	});
	const company = await db.company.create({
		data: { name: "Acme Labs", domain },
		select: { id: true },
	});
	const deal = await db.deal.create({
		data: {
			name: "Web crawl dataset",
			companyId: company.id,
			ownerId: owner,
		},
		select: { id: true },
	});
	dealId = deal.id;
});

beforeEach(() => {
	calls.length = 0;
});

afterAll(clean);

describe("DealNotifications", () => {
	it("tells everyone but the creator about a new deal", async () => {
		await notifications.created(dealId, actor);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.audience).toEqual({
			kind: "everyone-except",
			userId: actor,
		});
		expect(calls[0]?.message).toMatchObject({
			title: "New deal",
			body: "Ana added Web crawl dataset · Acme Labs",
			url: `/deals?record=deal:${dealId}`,
		});
	});

	it("names the stage a deal moved to, and calls out wins and losses", async () => {
		await notifications.stageChanged(dealId, "CONTRACT_SENT", actor);
		await notifications.stageChanged(dealId, "CLOSED_WON", actor);
		await notifications.stageChanged(dealId, "CLOSED_LOST", actor);

		expect(calls.map((call) => call.message.title)).toEqual([
			"Deal moved",
			"Deal won",
			"Deal lost",
		]);
		expect(calls[0]?.message.body).toBe(
			"Ana moved Web crawl dataset to Invoice sent",
		);
	});

	it("tells only the new owner about an assignment", async () => {
		await notifications.assigned(dealId, owner, actor);

		expect(calls).toEqual([
			expect.objectContaining({
				audience: { kind: "users", userIds: [owner] },
			}),
		]);
	});

	it("stays quiet when you assign a deal to yourself", async () => {
		await notifications.assigned(dealId, actor, actor);
		await notifications.bulkAssigned(actor, 4, actor);

		expect(calls).toEqual([]);
	});

	it("sums up a bulk assignment in one notification", async () => {
		await notifications.bulkAssigned(owner, 0, actor);
		await notifications.bulkAssigned(owner, 3, actor);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.message.body).toBe("Ana gave you 3 deals");
	});

	it("says Someone when it cannot tell who acted", async () => {
		await notifications.created(dealId, null);

		expect(calls[0]?.message.body).toStartWith("Someone added");
		expect(calls[0]?.audience).toEqual({
			kind: "everyone-except",
			userId: null,
		});
	});
});

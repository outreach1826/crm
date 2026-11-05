import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { ImportedEmail } from "../src/deal-emails/deal-emails.contracts";
import { importInput } from "../src/deal-emails/deal-emails.contracts";
import { DealEmailsService } from "../src/deal-emails/deal-emails.service";
import type { MailboxMatchService } from "../src/mailbox/mailbox-match.service";

const suffix = process.env.TEST_RUN_ID ?? "deal-emails-spec";
const team = `team-${suffix}.test`;
const client = `client-${suffix}.test`;
const ownerId = `user-${suffix}`;
const david = `david@${team}`;
const supply = `supply@${team}`;
const quietSince = new Date("2026-10-01T09:00:00.000Z");

const match = {
	async internalIdentity() {
		return { addresses: new Set([david]), domains: new Set([team]) };
	},
} as unknown as MailboxMatchService;

const emails = new DealEmailsService(
	db,
	match,
	new ActivitiesService(db, new ActivityStampService(db)),
);

const ids = { deal: "", company: "", contact: "" };

async function clean() {
	await db.emailThread.deleteMany({
		where: { messages: { some: { mailbox: { endsWith: team } } } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${client}` } } });
	await db.company.deleteMany({ where: { domain: client } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

function mail(overrides: Partial<ImportedEmail> & { gmailMessageId: string }) {
	return importInput.parse({
		messages: [
			{
				dealId: ids.deal,
				mailbox: david,
				gmailThreadId: "thread-a",
				from: { email: david, name: "David" },
				to: [{ email: `ada@${client}`, name: "Ada" }],
				cc: [{ email: supply }],
				subject: "Samples",
				body: "Full body of the email.\nSecond line.",
				sentAt: "2026-03-04T15:20:00.000Z",
				direction: "sent",
				...overrides,
			},
		],
	}).messages[0] as ImportedEmail;
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: {
			id: ownerId,
			name: "David",
			email: david,
			emailVerified: true,
		},
	});
	const company = await db.company.create({
		data: {
			name: `Client ${suffix}`,
			domain: client,
			lastActivityAt: quietSince,
		},
		select: { id: true },
	});
	const contact = await db.contact.create({
		data: {
			firstName: "Ada",
			email: `ada@${client}`,
			companyId: company.id,
		},
		select: { id: true },
	});
	const deal = await db.deal.create({
		data: {
			name: `Client deal ${suffix}`,
			companyId: company.id,
			ownerId,
			stage: "QUALIFIED_TO_BUY",
			stageChangedAt: quietSince,
			lastActivityAt: quietSince,
		},
		select: { id: true },
	});
	ids.deal = deal.id;
	ids.company = company.id;
	ids.contact = contact.id;
});

afterAll(clean);

describe("importing emails onto a deal", () => {
	it("imports sent and received mail as one thread in time order", async () => {
		const reply = mail({
			gmailMessageId: "m-2",
			from: { email: `ada@${client}`, name: "Ada" },
			to: [{ email: david }],
			cc: [],
			subject: "Re: Samples",
			body: "Thanks, received.",
			sentAt: "2026-03-05T08:00:00.000Z",
			direction: "received",
		});
		const first = mail({ gmailMessageId: "m-1" });

		const outcome = await emails.import({ messages: [reply, first] }, ownerId);

		expect(outcome).toMatchObject({ imported: 2, skipped: 0, failed: 0 });
		expect(outcome.results.map((result) => result.gmailMessageId)).toEqual([
			"m-1",
			"m-2",
		]);

		const listed = await emails.list({
			dealId: ids.deal,
			page: 1,
			pageSize: 20,
		});
		expect(listed.totalThreads).toBe(1);
		const [thread] = listed.threads;
		expect(thread?.subject).toBe("Samples");
		expect(thread?.messageCount).toBe(2);
		expect(thread?.messages.map((message) => message.gmailMessageId)).toEqual([
			"m-1",
			"m-2",
		]);
		expect(thread?.messages[0]).toMatchObject({
			mailbox: david,
			gmailThreadId: "thread-a",
			direction: "sent",
			from: { email: david, name: "David" },
			to: [{ email: `ada@${client}`, name: "Ada" }],
			cc: [{ email: supply, name: null }],
			body: "Full body of the email.\nSecond line.",
			sentAt: "2026-03-04T15:20:00.000Z",
		});
		expect(thread?.messages[1]?.direction).toBe("received");
	});

	it("skips a message it already has from the same mailbox", async () => {
		const outcome = await emails.import(
			{ messages: [mail({ gmailMessageId: "m-1" })] },
			ownerId,
		);

		expect(outcome).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
	});

	it("skips the other mailbox's copy of the same email", async () => {
		const copy = (mailbox: string, gmailMessageId: string) =>
			mail({
				mailbox,
				gmailMessageId,
				gmailThreadId: `thread-${mailbox}`,
				rfcMessageId: `<shared-${suffix}@mail.test>`,
				sentAt: "2026-04-01T10:00:00.000Z",
			});

		const outcome = await emails.import(
			{ messages: [copy(david, "d-9"), copy(supply, "s-9")] },
			ownerId,
		);

		expect(outcome).toMatchObject({ imported: 1, skipped: 1, failed: 0 });
	});

	it("fails a message for a missing deal or an outside mailbox and creates nothing", async () => {
		const dealsBefore = await db.deal.count();

		const outcome = await emails.import(
			{
				messages: [
					mail({ gmailMessageId: "x-1", dealId: "no-such-deal" }),
					mail({ gmailMessageId: "x-2", mailbox: "someone@gmail.com" }),
				],
			},
			ownerId,
		);

		expect(outcome).toMatchObject({ imported: 0, skipped: 0, failed: 2 });
		expect(await db.deal.count()).toBe(dealsBefore);
	});

	it("leaves the follow-up clocks where they were", async () => {
		const deal = await db.deal.findUniqueOrThrow({
			where: { id: ids.deal },
			select: { lastActivityAt: true, stageChangedAt: true },
		});
		const company = await db.company.findUniqueOrThrow({
			where: { id: ids.company },
			select: { lastActivityAt: true },
		});

		expect(deal.lastActivityAt).toEqual(quietSince);
		expect(deal.stageChangedAt).toEqual(quietSince);
		expect(company.lastActivityAt).toEqual(quietSince);
	});

	it("dates the email entry at the email, not at the import", async () => {
		const entries = await db.activity.findMany({
			where: { dealId: ids.deal, type: "EMAIL" },
			orderBy: { occurredAt: "asc" },
			select: { createdAt: true, occurredAt: true, contactId: true },
		});

		expect(entries[0]).toMatchObject({
			createdAt: new Date("2026-03-05T08:00:00.000Z"),
			occurredAt: new Date("2026-03-05T08:00:00.000Z"),
			contactId: ids.contact,
		});
	});
});

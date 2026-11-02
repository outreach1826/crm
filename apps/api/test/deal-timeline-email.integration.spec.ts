import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "deal-timeline-email-spec";
const domain = `deal-mail-${suffix}.test`;
const ownerId = `user-${suffix}`;

const activities = new ActivitiesService(db, new ActivityStampService(db));

const ids = { deal: "", otherDeal: "", email: "", note: "", dealNote: "" };

async function clean() {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: suffix } },
	});
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

async function thread(
	key: string,
	target: { companyId?: string; contactId?: string },
) {
	const at = new Date("2026-10-30T10:00:00.000Z");
	const created = await db.emailThread.create({
		data: {
			rootMessageId: `<${key}-${suffix}@mail.test>`,
			subject: key,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 2,
			...target,
		},
		select: { id: true },
	});
	return db.activity.create({
		data: {
			type: "EMAIL",
			subject: key,
			occurredAt: at,
			emailThreadId: created.id,
			createdById: ownerId,
			...target,
		},
		select: { id: true },
	});
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: {
			id: ownerId,
			name: "Mail Rep",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Deal Mail ${suffix}`, domain },
		select: { id: true },
	});
	const outsider = await db.company.create({
		data: { name: `Elsewhere ${suffix}`, domain: `other.${domain}` },
		select: { id: true },
	});
	const person = await db.contact.create({
		data: { firstName: "Mia", lastName: "Mail", companyId: company.id },
		select: { id: true },
	});
	const deal = await db.deal.create({
		data: {
			name: `Deal Mail ${suffix}`,
			companyId: company.id,
			ownerId,
			contacts: { create: { contactId: person.id } },
		},
		select: { id: true },
	});
	const otherDeal = await db.deal.create({
		data: { name: `Elsewhere ${suffix}`, companyId: outsider.id, ownerId },
		select: { id: true },
	});
	ids.deal = deal.id;
	ids.otherDeal = otherDeal.id;

	const fromPerson = await thread("from-person", { contactId: person.id });
	await thread("from-outsider", { companyId: outsider.id });
	ids.email = fromPerson.id;

	const note = await db.activity.create({
		data: {
			type: "NOTE",
			body: "company note",
			companyId: company.id,
			createdById: ownerId,
		},
		select: { id: true },
	});
	const dealNote = await db.activity.create({
		data: {
			type: "NOTE",
			body: "deal note",
			companyId: company.id,
			createdById: ownerId,
			dealId: deal.id,
		},
		select: { id: true },
	});
	ids.note = note.id;
	ids.dealNote = dealNote.id;
});

afterAll(clean);

describe("a deal's timeline", () => {
	it("shows the synced emails of the deal's people and company", async () => {
		const { entries } = await activities.timeline({
			dealId: ids.deal,
			filter: "all",
			limit: 30,
		});
		const shown = entries.map((entry) => entry.id);

		expect(shown).toContain(ids.email);
		expect(shown).toContain(ids.dealNote);
		expect(shown).not.toContain(ids.note);
	});

	it("keeps another company's emails off the deal", async () => {
		const { entries } = await activities.timeline({
			dealId: ids.deal,
			filter: "email",
			limit: 30,
		});

		expect(entries.map((entry) => entry.subject)).toEqual(["from-person"]);
	});

	it("counts the emails it shows", async () => {
		const counts = await activities.timelineCounts({ dealId: ids.deal });

		expect(counts.email).toBe(1);
		expect(counts.all).toBe(2);
	});
});

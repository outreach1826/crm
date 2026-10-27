import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { FreshnessService } from "../src/freshness/freshness.service";

const suffix = process.env.TEST_RUN_ID ?? "freshness-spec";
const domain = `freshness-${suffix}.test`;

const freshness = new FreshnessService(db);

afterAll(async () => {
	await db.company.deleteMany({ where: { domain } });
});

describe("freshness.stamp", () => {
	it("changes when a record is created, edited or deleted", async () => {
		await db.company.deleteMany({ where: { domain } });
		const before = await freshness.stamp();

		const company = await db.company.create({
			data: { name: `Freshness ${suffix}`, domain },
			select: { id: true },
		});
		const created = await freshness.stamp();
		expect(created).not.toBe(before);

		await db.company.update({
			where: { id: company.id },
			data: { name: `Freshness ${suffix} renamed` },
		});
		const edited = await freshness.stamp();
		expect(edited).not.toBe(created);

		await db.company.delete({ where: { id: company.id } });
		const deleted = await freshness.stamp();
		expect(deleted).not.toBe(edited);
	});

	it("has one part per watched table", async () => {
		const stamp = await freshness.stamp();
		expect(stamp.split("|")).toHaveLength(4);
	});
});

import { describe, expect, it } from "bun:test";
import type { DealStage } from "@crm/db/enums";
import {
	FOLLOW_UP,
	needsFollowUp,
	quietSince,
	snoozeUntil,
} from "../lib/follow-up";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");

function daysAgo(days: number): string {
	return new Date(NOW - days * 86_400_000).toISOString();
}

function deal(
	id: string,
	stage: DealStage,
	stageChangedDaysAgo: number,
	lastActivityDaysAgo: number | null,
) {
	return {
		id,
		stage,
		stageChangedAt: daysAgo(stageChangedDaysAgo),
		lastActivityAt:
			lastActivityDaysAgo === null ? null : daysAgo(lastActivityDaysAgo),
	};
}

describe("quietSince", () => {
	it("uses the stage change when nothing has happened since", () => {
		const entry = deal("a", "DEMO_BOOKED", 3, null);
		expect(quietSince(entry)).toBe(entry.stageChangedAt);
	});

	it("uses whichever came later, activity or stage change", () => {
		const touched = deal("a", "DEMO_BOOKED", 10, 2);
		expect(quietSince(touched)).toBe(touched.lastActivityAt as string);

		const moved = deal("b", "DEMO_BOOKED", 1, 9);
		expect(quietSince(moved)).toBe(moved.stageChangedAt);
	});
});

describe("needsFollowUp", () => {
	it("flags a deal once it has been quiet for its stage's limit", () => {
		const limit = FOLLOW_UP.quietDays.CONTRACT_SENT;

		expect(
			needsFollowUp([deal("a", "CONTRACT_SENT", limit, null)], NOW),
		).toHaveLength(1);
		expect(
			needsFollowUp([deal("a", "CONTRACT_SENT", limit - 1, null)], NOW),
		).toHaveLength(0);
	});

	it("never flags a closed deal, however quiet", () => {
		const closed = [
			deal("won", "CLOSED_WON", 400, null),
			deal("lost", "CLOSED_LOST", 400, null),
			deal("unq", "UNQUALIFIED_TO_BUY", 400, null),
		];

		expect(needsFollowUp(closed, NOW)).toEqual([]);
	});

	it("clears a deal as soon as someone logs an activity on it", () => {
		expect(needsFollowUp([deal("a", "DEMO_BOOKED", 30, 0)], NOW)).toEqual([]);
	});

	it("puts the most overdue deal first", () => {
		const result = needsFollowUp(
			[
				deal("slightly", "DEMO_BOOKED", 8, null),
				deal("badly", "CONTRACT_SENT", 20, null),
				deal("middling", "QUALIFIED_TO_BUY", 12, null),
			],
			NOW,
		);

		expect(result.map((entry) => entry.deal.id)).toEqual([
			"badly",
			"middling",
			"slightly",
		]);
		expect(result[0]).toMatchObject({ quietDays: 20, limitDays: 3 });
	});
});

describe("snoozeUntil", () => {
	it("is the given number of whole days from now", () => {
		expect(snoozeUntil(2, NOW)).toBe("2026-10-28T12:00:00.000Z");
	});
});

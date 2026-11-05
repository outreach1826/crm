import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import {
	backfillProgressOf,
	GmailBackfillService,
	historyImportOf,
} from "../src/google/gmail-backfill.service";
import { GMAIL_SYNC } from "../src/google/gmail-sync.config";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import type {
	BackfillProgress,
	SyncStateService,
} from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

const DAY_MS = 86_400_000;
const START = new Date("2026-01-01T00:00:00.000Z");

type Mail = { id: string; at: Date };

function mailEvery(count: number, stepMs: number, from = START): Mail[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `m-${index}`,
		at: new Date(from.getTime() + (index + 1) * stepMs),
	}));
}

function message(mail: Mail): GmailMessage {
	return {
		id: mail.id,
		internalDate: String(mail.at.getTime()),
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${mail.id}@mail.test>` },
				{ name: "From", value: "Ada <ada@client.test>" },
				{ name: "To", value: "rep@trycomp.ai" },
				{ name: "Subject", value: mail.id },
			],
		},
	};
}

function rowAt(progress: Partial<BackfillProgress> & { until: Date }) {
	return {
		id: "sync-1",
		userId: "user-1",
		source: "gmail",
		autoCreate: false,
		backfillFrom: progress.from ?? START,
		backfillUntil: progress.until,
		backfillPageToken: progress.pageToken ?? null,
		backfillOffset: progress.offset ?? 0,
	} as unknown as MailboxSync;
}

function harness(options: {
	mail: Mail[];
	alreadyStored?: string[];
	failOn?: (id: string) => MailboxResult<GmailMessage> | null;
}) {
	const stored: IncomingMessage[] = [];
	const fetched: string[] = [];
	const saved: BackfillProgress[] = [];
	let lists = 0;

	const gmail = {
		async listMessages(_token: string, range: { after: Date; before: Date }) {
			lists += 1;
			const messages = options.mail
				.filter(
					(mail) =>
						mail.at.getTime() >= range.after.getTime() &&
						mail.at.getTime() < range.before.getTime(),
				)
				.sort((a, b) => b.at.getTime() - a.at.getTime())
				.map((mail) => ({ id: mail.id }));
			return { outcome: "ok" as const, data: { messages } };
		},
		async getMessage(_token: string, id: string) {
			fetched.push(id);
			const failure = options.failOn?.(id);
			if (failure) return failure;
			const mail = options.mail.find((candidate) => candidate.id === id);
			if (!mail) throw new Error(`unknown ${id}`);
			return { outcome: "ok" as const, data: message(mail) };
		},
	} as unknown as GmailClient;

	const db = {
		emailMessage: {
			async findMany(query: { where: { gmailMessageId: { in: string[] } } }) {
				const have = new Set([
					...(options.alreadyStored ?? []),
					...stored.map((parsed) => parsed.gmailMessageId),
				]);
				return query.where.gmailMessageId.in
					.filter((id) => have.has(id))
					.map((gmailMessageId) => ({ gmailMessageId }));
			},
		},
	} as unknown as Db;

	const state = {
		async saveBackfill(_id: string, progress: BackfillProgress) {
			saved.push({ ...progress });
		},
	} as unknown as SyncStateService;

	const threads = {
		async context() {
			return {};
		},
		async store(
			_row: MailboxSync,
			_options: { mailbox: string; origin: "gmail" },
			parsed: IncomingMessage,
		) {
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new GmailBackfillService(db, gmail, state, threads),
		stored,
		fetched,
		saved,
		lists: () => lists,
	};
}

describe("Gmail history import", () => {
	it("starts twelve months before the first run and ends at it", () => {
		const now = new Date("2026-11-05T12:00:00.000Z");
		const fresh = {
			backfillFrom: null,
			backfillUntil: null,
		} as unknown as MailboxSync;

		const progress = backfillProgressOf(fresh, now);

		expect(progress.until).toEqual(now);
		expect(progress.from).toEqual(
			new Date(now.getTime() - GMAIL_SYNC.backfill.lookbackMs),
		);
		expect(historyImportOf(fresh)).toBeNull();
	});

	it("imports every message oldest first and finishes", async () => {
		const mail = mailEvery(6, 3 * DAY_MS);
		const until = new Date(START.getTime() + 20 * DAY_MS);
		const run = harness({ mail });

		const outcome = await run.service.run(
			rowAt({ until }),
			"token",
			"rep@trycomp.ai",
		);

		expect(outcome).toEqual({ outcome: "ok", written: 6 });
		expect(run.stored.map((parsed) => parsed.gmailMessageId)).toEqual(
			mail.map((entry) => entry.id),
		);
		const last = run.saved.at(-1);
		expect(last?.from).toEqual(until);
		expect(historyImportOf(rowAt({ from: last?.from, until }))?.done).toBe(
			true,
		);
	});

	it("stops at the per-run limit and resumes where it stopped", async () => {
		const limit = GMAIL_SYNC.backfill.messagesPerTick;
		const mail = mailEvery(limit + 40, 60_000);
		const until = new Date(START.getTime() + 2 * DAY_MS);
		const run = harness({ mail });

		await run.service.run(rowAt({ until }), "token", "rep@trycomp.ai");

		expect(run.stored).toHaveLength(limit);
		const paused = run.saved.at(-1);
		expect(paused?.from).toEqual(START);
		expect(paused?.offset).toBe(limit);

		await run.service.run(
			rowAt({ ...paused, until }),
			"token",
			"rep@trycomp.ai",
		);

		const ids = run.stored.map((parsed) => parsed.gmailMessageId);
		expect(ids).toEqual(mail.map((entry) => entry.id));
		expect(run.saved.at(-1)?.from).toEqual(until);
	});

	it("keeps its place when Gmail rate-limits it", async () => {
		const mail = mailEvery(10, 60_000);
		const until = new Date(START.getTime() + DAY_MS);
		const run = harness({
			mail,
			failOn: (id) =>
				id === "m-4"
					? { outcome: "rate-limited", reason: "slow down", retryAfterMs: 1 }
					: null,
		});

		const outcome = await run.service.run(
			rowAt({ until }),
			"token",
			"rep@trycomp.ai",
		);

		expect(outcome.outcome).toBe("rate-limited");
		expect(run.stored.map((parsed) => parsed.gmailMessageId)).toEqual([
			"m-0",
			"m-1",
			"m-2",
			"m-3",
		]);
		expect(run.saved.at(-1)).toMatchObject({ from: START, offset: 4 });
	});

	it("skips messages the live sync already stored", async () => {
		const mail = mailEvery(4, DAY_MS);
		const until = new Date(START.getTime() + 6 * DAY_MS);
		const run = harness({ mail, alreadyStored: ["m-1", "m-2"] });

		await run.service.run(rowAt({ until }), "token", "rep@trycomp.ai");

		expect(run.fetched).toEqual(["m-0", "m-3"]);
	});

	it("does nothing once the import is finished", async () => {
		const until = new Date(START.getTime() + DAY_MS);
		const run = harness({ mail: mailEvery(3, 60_000) });

		const outcome = await run.service.run(
			rowAt({ from: until, until }),
			"token",
			"rep@trycomp.ai",
		);

		expect(outcome).toEqual({ outcome: "ok", written: 0 });
		expect(run.lists()).toBe(0);
		expect(run.saved).toHaveLength(0);
	});
});

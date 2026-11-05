import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import {
	type BackfillProgress,
	SyncStateService,
} from "../mailbox/sync-state.service";
import { ThreadWriterService } from "../mailbox/thread-writer.service";
import { GmailClient, type GmailMessage } from "./gmail.client";
import { parseGmailMessage } from "./gmail-message";
import { GMAIL_SYNC } from "./gmail-sync.config";

type Failure = Exclude<MailboxResult<never>, { outcome: "ok" }>;

export type BackfillOutcome = { outcome: "ok"; written: number } | Failure;

const LIMITS = GMAIL_SYNC.backfill;

export function backfillProgressOf(
	row: MailboxSync,
	now: Date,
): BackfillProgress {
	if (row.backfillUntil && row.backfillFrom) {
		return {
			from: row.backfillFrom,
			until: row.backfillUntil,
			pageToken: row.backfillPageToken,
			offset: row.backfillOffset,
		};
	}

	return {
		from: new Date(now.getTime() - LIMITS.lookbackMs),
		until: now,
		pageToken: null,
		offset: 0,
	};
}

export function historyImportOf(
	row: MailboxSync,
): { through: string; done: boolean } | null {
	if (!row.backfillFrom || !row.backfillUntil) return null;

	const progress = backfillProgressOf(row, row.backfillUntil);
	return {
		through: progress.from.toISOString(),
		done: isBackfillDone(progress),
	};
}

export function isBackfillDone(progress: BackfillProgress): boolean {
	return progress.from.getTime() >= progress.until.getTime();
}

@Injectable()
export class GmailBackfillService {
	private readonly logger = new Logger(GmailBackfillService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async run(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
	): Promise<BackfillOutcome> {
		const progress = backfillProgressOf(row, new Date());
		if (isBackfillDone(progress)) return { outcome: "ok", written: 0 };

		let context: MatchContext | null = null;
		let fetched = 0;
		let lists = 0;
		let written = 0;
		let failure: Failure | null = null;

		while (
			!isBackfillDone(progress) &&
			fetched < LIMITS.messagesPerTick &&
			lists < LIMITS.listsPerTick
		) {
			const windowEnd = new Date(
				Math.min(
					progress.from.getTime() + LIMITS.windowMs,
					progress.until.getTime(),
				),
			);

			const page = await this.gmail.listMessages(accessToken, {
				after: progress.from,
				before: windowEnd,
				pageToken: progress.pageToken ?? undefined,
				maxResults: LIMITS.pageSize,
			});
			lists += 1;

			if (page.outcome !== "ok") {
				failure = page;
				break;
			}

			const ids = (page.data.messages ?? [])
				.flatMap((message) => (message.id ? [message.id] : []))
				.reverse();

			const slice = ids.slice(
				progress.offset,
				progress.offset + LIMITS.messagesPerTick - fetched,
			);

			context ??= await this.threads.context();
			const result = await this.ingest(
				row,
				accessToken,
				mailbox,
				slice,
				context,
			);

			fetched += result.processed;
			written += result.written;
			progress.offset += result.processed;

			if (result.failure) {
				failure = result.failure;
				break;
			}

			if (progress.offset < ids.length) break;

			progress.offset = 0;
			if (page.data.nextPageToken) {
				progress.pageToken = page.data.nextPageToken;
			} else {
				progress.pageToken = null;
				progress.from = windowEnd;
			}
		}

		await this.state.saveBackfill(row.id, progress);

		this.logger.log({
			message: isBackfillDone(progress)
				? "Gmail history import finished"
				: "Gmail history import step",
			userId: row.userId,
			messagesWritten: written,
			importedThrough: progress.from.toISOString(),
		});

		return failure ?? { outcome: "ok", written };
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		context: MatchContext,
	): Promise<{ processed: number; written: number; failure: Failure | null }> {
		const stored = await this.db.emailMessage.findMany({
			where: { gmailMessageId: { in: [...ids] } },
			select: { gmailMessageId: true },
		});
		const seen = new Set(stored.map((message) => message.gmailMessageId));

		let processed = 0;
		let written = 0;

		for (let at = 0; at < ids.length; at += LIMITS.fetchConcurrency) {
			const chunk = ids.slice(at, at + LIMITS.fetchConcurrency);
			const fetched = await Promise.all(
				chunk.map((id) =>
					seen.has(id)
						? Promise.resolve(null)
						: this.gmail.getMessage(accessToken, id),
				),
			);

			for (const result of fetched) {
				if (result && isStopping(result)) {
					return { processed, written, failure: result };
				}

				processed += 1;
				if (result?.outcome !== "ok") continue;

				if (await this.storeOne(row, mailbox, result.data, context)) {
					written += 1;
				}
			}
		}

		return { processed, written, failure: null };
	}

	private async storeOne(
		row: MailboxSync,
		mailbox: string,
		message: GmailMessage,
		context: MatchContext,
	): Promise<boolean> {
		const parsed = parseGmailMessage(message);
		if (!parsed) return false;

		return this.threads.store(
			row,
			{ mailbox, origin: "gmail", historical: true },
			parsed,
			context,
		);
	}
}

function isStopping(
	result: MailboxResult<GmailMessage>,
): result is Extract<Failure, { outcome: "unauthorized" | "rate-limited" }> {
	return result.outcome === "unauthorized" || result.outcome === "rate-limited";
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export const GMAIL_SYNC = {
	incremental: { messagesPerTick: 120 },
	backfill: {
		lookbackMs: 365 * DAY_MS,
		windowMs: 7 * DAY_MS,
		messagesPerTick: 250,
		listsPerTick: 20,
		pageSize: 500,
		fetchConcurrency: 5,
	},
} as const;

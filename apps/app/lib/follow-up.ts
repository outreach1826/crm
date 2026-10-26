import { DealStage } from "@crm/db/enums";

const DAY_MS = 86_400_000;

export const FOLLOW_UP = {
	quietDays: {
		[DealStage.DEMO_BOOKED]: 7,
		[DealStage.QUALIFIED_TO_BUY]: 7,
		[DealStage.DECISION_MAKER_BOUGHT_IN]: 5,
		[DealStage.CONTRACT_SENT]: 3,
	},
	snoozeDays: [2, 7],
} as const satisfies {
	quietDays: Partial<Record<DealStage, number>>;
	snoozeDays: readonly number[];
};

type FollowUpStage = keyof typeof FOLLOW_UP.quietDays;

export type FollowUpDeal = {
	stage: DealStage;
	lastActivityAt: string | null;
	stageChangedAt: string;
};

export type Overdue<TDeal extends FollowUpDeal> = {
	deal: TDeal;
	quietSince: string;
	quietDays: number;
	limitDays: number;
};

function hasLimit(stage: DealStage): stage is FollowUpStage {
	return stage in FOLLOW_UP.quietDays;
}

export function quietSince(deal: FollowUpDeal): string {
	if (!deal.lastActivityAt) return deal.stageChangedAt;
	return Date.parse(deal.lastActivityAt) > Date.parse(deal.stageChangedAt)
		? deal.lastActivityAt
		: deal.stageChangedAt;
}

export function needsFollowUp<TDeal extends FollowUpDeal>(
	deals: readonly TDeal[],
	now: number,
): Overdue<TDeal>[] {
	return deals
		.flatMap((deal) => {
			if (!hasLimit(deal.stage)) return [];

			const since = quietSince(deal);
			const quietDays = Math.floor((now - Date.parse(since)) / DAY_MS);
			const limitDays = FOLLOW_UP.quietDays[deal.stage];

			return quietDays >= limitDays
				? [{ deal, quietSince: since, quietDays, limitDays }]
				: [];
		})
		.sort((a, b) => b.quietDays - b.limitDays - (a.quietDays - a.limitDays));
}

export function snoozeUntil(days: number, now: number): string {
	return new Date(now + days * DAY_MS).toISOString();
}

export const FOLLOW_UP_STAGES = Object.keys(
	FOLLOW_UP.quietDays,
) as FollowUpStage[];

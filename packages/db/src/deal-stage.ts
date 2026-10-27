import { DealStage } from "./generated/prisma/enums";

export const OPEN_DEAL_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
] as const;

export const CLOSED_DEAL_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export const LOSING_DEAL_STAGES = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export const DEAL_STAGE_LABELS = {
	[DealStage.DEMO_BOOKED]: "Sample requested",
	[DealStage.QUALIFIED_TO_BUY]: "Sample sent",
	[DealStage.DECISION_MAKER_BOUGHT_IN]: "Negotiating",
	[DealStage.CONTRACT_SENT]: "Invoice sent",
	[DealStage.CLOSED_WON]: "Won (paid)",
	[DealStage.CLOSED_LOST]: "Lost",
	[DealStage.UNQUALIFIED_TO_BUY]: "Not a fit",
} as const satisfies Record<DealStage, string>;

const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);

export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}

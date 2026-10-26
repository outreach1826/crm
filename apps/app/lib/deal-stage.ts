import { DEAL_STAGE_LABELS } from "@crm/db/deal-stage";
import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const ORDER = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

type DealStagePresentation = Record<
	DealStage,
	{ label: string; tone: StatusTone }
>;

const PRESENTATION: DealStagePresentation = {
	DEMO_BOOKED: { label: DEAL_STAGE_LABELS.DEMO_BOOKED, tone: "neutral" },
	QUALIFIED_TO_BUY: { label: DEAL_STAGE_LABELS.QUALIFIED_TO_BUY, tone: "info" },
	DECISION_MAKER_BOUGHT_IN: {
		label: DEAL_STAGE_LABELS.DECISION_MAKER_BOUGHT_IN,
		tone: "info",
	},
	CONTRACT_SENT: { label: DEAL_STAGE_LABELS.CONTRACT_SENT, tone: "warning" },
	CLOSED_WON: { label: DEAL_STAGE_LABELS.CLOSED_WON, tone: "success" },
	CLOSED_LOST: { label: DEAL_STAGE_LABELS.CLOSED_LOST, tone: "error" },
	UNQUALIFIED_TO_BUY: {
		label: DEAL_STAGE_LABELS.UNQUALIFIED_TO_BUY,
		tone: "neutral",
	},
};

export const OPEN_STAGES = ORDER.slice(0, 4) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

const OPEN_STAGE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
] as const;

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return OPEN_STAGE_COLORS[OPEN_STAGES.indexOf(stage)] ?? "var(--chart-5)";
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}

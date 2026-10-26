"use client";

import type { DealStage } from "@crm/db/enums";
import { Badge } from "@crm/ui/components/badge";
import {
	KanbanBoard,
	KanbanCard,
	KanbanColumn,
	KanbanEmpty,
} from "@crm/ui/components/kanban";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CompanyCell } from "@/components/crm/company-cell";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	DealStageMenu,
	useChangeDealStage,
} from "@/components/crm/stage-change";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { PageShellLoading } from "@/components/page-shell";
import { DEAL_STAGE_OPTIONS, dealStageLabel } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { DEALS_BOARD_INPUT } from "./deals-view-params";

type Board = RouterOutputs["deals"]["board"];

type BoardCard = Board["cards"][number];

function isStage(value: string): value is DealStage {
	return DEAL_STAGE_OPTIONS.some((option) => option.value === value);
}

function moveCard(board: Board, dealId: string, to: DealStage): Board {
	const card = board.cards.find((entry) => entry.id === dealId);
	if (!card) return board;

	const value = card.baseAmountCents;

	return {
		...board,
		cards: board.cards.map((entry) =>
			entry.id === dealId
				? { ...entry, stage: to, stageChangedAt: new Date().toISOString() }
				: entry,
		),
		columns: board.columns.map((column) => {
			if (column.stage === card.stage) {
				return {
					...column,
					count: column.count - 1,
					valueCents:
						value === null || column.valueCents === null
							? column.valueCents
							: column.valueCents - value,
				};
			}
			if (column.stage === to) {
				return {
					...column,
					count: column.count + 1,
					valueCents:
						value === null
							? column.valueCents
							: (column.valueCents ?? 0) + value,
				};
			}
			return column;
		}),
	};
}

function DealCard({ card }: { card: BoardCard }) {
	const openRecord = useOpenRecord();
	const prefetchRecord = usePrefetchRecord();

	return (
		<KanbanCard id={card.id} label={card.name}>
			<button
				type="button"
				className="min-w-0 truncate text-left font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
				onClick={() => openRecord({ kind: "deal", id: card.id })}
				onMouseEnter={() => prefetchRecord({ kind: "deal", id: card.id })}
				onFocus={() => prefetchRecord({ kind: "deal", id: card.id })}
			>
				{card.name}
			</button>

			<CompanyCell company={card.company} />

			<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
				<span className="text-foreground tabular-nums">
					{card.amountCents === null
						? "No amount"
						: formatMoney(card.amountCents, card.currency)}
				</span>
				{card.expectedCloseDate ? (
					<span>
						Closes <LocalDay date={card.expectedCloseDate} />
					</span>
				) : null}
			</div>

			<div className="relative z-10 flex items-center justify-between gap-2 text-xs">
				<OwnerCell owner={card.owner} compact />
				<DealStageMenu dealId={card.id} stage={card.stage} />
			</div>

			<span className="text-muted-foreground text-xs">
				{card.lastActivityAt ? (
					<>
						Last activity <LocalRelativeTime date={card.lastActivityAt} />
					</>
				) : (
					"No activity yet"
				)}
			</span>
		</KanbanCard>
	);
}

function DragPreview({ card }: { card: BoardCard }) {
	return (
		<div className="flex w-72 flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-md">
			<span className="truncate font-medium">{card.name}</span>
			<CompanyCell company={card.company} />
		</div>
	);
}

export function DealsBoard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const stageChange = useChangeDealStage();

	const boardOptions = trpc.deals.board.queryOptions(DEALS_BOARD_INPUT);
	const board = useQuery(boardOptions);

	if (!board.data) return <PageShellLoading />;

	const { cards, columns, reportingCurrency, truncated, unconverted } =
		board.data;
	const byId = new Map(cards.map((card) => [card.id, card]));
	const columnByStage = new Map(
		columns.map((column) => [column.stage, column]),
	);

	const move = (dealId: string, columnId: string) => {
		const card = byId.get(dealId);
		if (!card || !isStage(columnId)) return;

		const result = stageChange.change(card.id, card.stage, columnId, () => {
			void queryClient.invalidateQueries({ queryKey: boardOptions.queryKey });
		});

		if (result === "saving") {
			queryClient.setQueryData(boardOptions.queryKey, (previous) =>
				previous ? moveCard(previous, dealId, columnId) : previous,
			);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			<KanbanBoard
				className="flex-1"
				onMove={move}
				itemLabel={(id) => byId.get(id)?.name ?? "Deal"}
				columnLabel={(id) => (isStage(id) ? dealStageLabel(id) : id)}
				renderOverlay={(id) => {
					const card = byId.get(id);
					return card ? <DragPreview card={card} /> : null;
				}}
			>
				{DEAL_STAGE_OPTIONS.map(({ value: stage, label }) => {
					const column = columnByStage.get(stage);
					const stageCards = cards.filter((card) => card.stage === stage);

					return (
						<KanbanColumn
							key={stage}
							id={stage}
							label={label}
							header={
								<>
									<span className="flex min-w-0 items-center gap-2">
										<DealStageIndicator stage={stage} />
										<Badge variant="secondary">{column?.count ?? 0}</Badge>
									</span>
									{column?.valueCents ? (
										<span className="text-muted-foreground text-xs tabular-nums">
											{formatMoney(column.valueCents, reportingCurrency)}
										</span>
									) : null}
								</>
							}
						>
							{stageCards.length === 0 ? (
								<KanbanEmpty>No deals here yet</KanbanEmpty>
							) : (
								stageCards.map((card) => <DealCard key={card.id} card={card} />)
							)}
						</KanbanColumn>
					);
				})}
			</KanbanBoard>

			{truncated || unconverted.count > 0 ? (
				<p className="text-muted-foreground text-xs">
					{truncated ? "Showing the most recently moved deals only. " : null}
					{unconverted.count > 0
						? `${unconverted.count} deals in ${unconverted.currencies.join(", ")} are left out of the column totals until a rate is set.`
						: null}
				</p>
			) : null}
		</div>
	);
}

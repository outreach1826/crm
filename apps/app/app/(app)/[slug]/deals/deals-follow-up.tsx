"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CompanyCell } from "@/components/crm/company-cell";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useChangeDealStage } from "@/components/crm/stage-change";
import { LocalRelativeTime } from "@/components/local-date-time";
import { dealStageLabel } from "@/lib/deal-stage";
import {
	FOLLOW_UP,
	FOLLOW_UP_STAGES,
	needsFollowUp,
	type Overdue,
	snoozeUntil,
} from "@/lib/follow-up";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type BoardCard = RouterOutputs["deals"]["board"]["cards"][number];

const CONTACT_TYPES = [
	{ type: "CALL", label: "Call" },
	{ type: "EMAIL", label: "Email" },
	{ type: "MEETING", label: "Meeting" },
] as const;

function durationLabel(days: number): string {
	if (days % 7 === 0) {
		const weeks = days / 7;
		return weeks === 1 ? "1 week" : `${weeks} weeks`;
	}
	return days === 1 ? "1 day" : `${days} days`;
}

function useLogActivity() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function FollowUpCard({ entry }: { entry: Overdue<BoardCard> }) {
	const { deal } = entry;
	const openRecord = useOpenRecord();
	const stageChange = useChangeDealStage();
	const log = useLogActivity();

	return (
		<article
			aria-label={deal.name}
			className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-card p-3 text-sm"
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<DealStageIndicator stage={deal.stage} />
				<span className="text-muted-foreground tabular-nums">
					Quiet {entry.quietDays}d · limit {entry.limitDays}d
				</span>
			</div>

			<button
				type="button"
				className="truncate text-left font-medium outline-none hover:underline focus-visible:underline"
				onClick={() => openRecord({ kind: "deal", id: deal.id })}
			>
				{deal.name}
			</button>

			<CompanyCell company={deal.company} />

			<span className="text-muted-foreground text-xs">
				Last touched <LocalRelativeTime date={entry.quietSince} />
			</span>

			<div className="flex flex-wrap items-center gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" disabled={log.isPending}>
							Contacted
							<Icon icon={ChevronDown} data-icon="inline-end" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{CONTACT_TYPES.map(({ type, label }) => (
							<DropdownMenuItem
								key={type}
								onSelect={() =>
									log.mutate(
										{ type, subject: "Followed up", dealId: deal.id },
										{
											onSuccess: () =>
												toast.success(
													`Logged a ${label.toLowerCase()} on ${deal.name}.`,
												),
										},
									)
								}
							>
								{label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="outline" disabled={log.isPending}>
							Snooze
							<Icon icon={ChevronDown} data-icon="inline-end" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{FOLLOW_UP.snoozeDays.map((days) => (
							<DropdownMenuItem
								key={days}
								onSelect={() =>
									log.mutate(
										{
											type: "TASK",
											subject: `Follow up on ${deal.name}`,
											dueAt: snoozeUntil(days, Date.now()),
											dealId: deal.id,
										},
										{
											onSuccess: () =>
												toast.success(
													`Snoozed ${deal.name} for ${durationLabel(days)}. A follow-up task is on the deal.`,
												),
										},
									)
								}
							>
								{durationLabel(days)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<Button
					size="sm"
					variant="ghost"
					disabled={stageChange.pending}
					onClick={() => stageChange.change(deal.id, deal.stage, "CLOSED_LOST")}
				>
					Pass
				</Button>
			</div>
		</article>
	);
}

export function DealsFollowUp({ cards }: { cards: BoardCard[] }) {
	const [open, setOpen] = useState(true);

	const overdue = needsFollowUp(cards, Date.now());
	if (overdue.length === 0) return null;

	const limits = FOLLOW_UP_STAGES.map(
		(stage) => `${dealStageLabel(stage)} ${FOLLOW_UP.quietDays[stage]}d`,
	).join(" · ");

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<CollapsibleTrigger asChild>
					<Button variant="ghost" size="sm">
						<Icon
							icon={ChevronDown}
							data-icon="inline-start"
							className={open ? undefined : "-rotate-90"}
						/>
						Needs follow-up
						<Badge variant="secondary">{overdue.length}</Badge>
					</Button>
				</CollapsibleTrigger>
				<p className="text-muted-foreground text-xs">
					Quiet longer than: {limits}
				</p>
			</div>

			<CollapsibleContent>
				<div className="flex gap-3 overflow-x-auto pb-1">
					{overdue.map((entry) => (
						<FollowUpCard key={entry.deal.id} entry={entry} />
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

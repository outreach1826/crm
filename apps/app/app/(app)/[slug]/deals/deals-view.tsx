"use client";

import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useQueryState } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { DealsBoard } from "./deals-board";
import { DealsTable } from "./deals-table";
import {
	DEALS_VIEWS,
	type DealsView as DealsViewName,
	dealsViewParsers,
} from "./deals-view-params";

const LABELS = {
	board: "Board",
	table: "Table",
} satisfies Record<DealsViewName, string>;

function isView(value: string): value is DealsViewName {
	return (DEALS_VIEWS as readonly string[]).includes(value);
}

function useDealsView() {
	return useQueryState(
		SEARCH_PARAM.deals.view,
		dealsViewParsers[SEARCH_PARAM.deals.view],
	);
}

export function DealsViewToggleFallback() {
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			spacing={0}
			disabled
			aria-label="How to show deals"
		>
			{DEALS_VIEWS.map((value) => (
				<ToggleGroupItem key={value} value={value}>
					{LABELS[value]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

export function DealsViewToggle() {
	const [view, setView] = useDealsView();

	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			spacing={0}
			value={view}
			onValueChange={(next) => {
				if (isView(next)) void setView(next);
			}}
			aria-label="How to show deals"
		>
			{DEALS_VIEWS.map((value) => (
				<ToggleGroupItem key={value} value={value}>
					{LABELS[value]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

export function DealsView() {
	const [view] = useDealsView();

	return view === "board" ? <DealsBoard /> : <DealsTable />;
}

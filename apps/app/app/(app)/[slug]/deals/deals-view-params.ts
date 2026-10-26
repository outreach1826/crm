import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import type { RouterInputs } from "@/lib/trpc/types";

export const DEALS_VIEWS = ["board", "table"] as const;

export type DealsView = (typeof DEALS_VIEWS)[number];

export const dealsViewParsers = {
	[SEARCH_PARAM.deals.view]:
		parseAsStringLiteral(DEALS_VIEWS).withDefault("board"),
};

export const loadDealsViewParams = createLoader(dealsViewParsers);

export const DEALS_BOARD_INPUT = {
	owner: [],
} satisfies RouterInputs["deals"]["board"];

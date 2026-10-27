import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const OVERVIEW_SCOPES = ["me", "everyone"] as const;

export type OverviewScope = (typeof OVERVIEW_SCOPES)[number];

const scope = parseAsStringLiteral(OVERVIEW_SCOPES);

export function overviewScopeParser(defaultScope: OverviewScope) {
	return scope.withDefault(defaultScope);
}

export const loadOverviewSearchParams = createLoader({
	[SEARCH_PARAM.overview.scope]: scope,
});

import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateDealSheet } from "./create-deal-sheet";
import { dealsSearchParams } from "./deals-search-params";
import {
	DealsView,
	DealsViewToggle,
	DealsViewToggleFallback,
} from "./deals-view";
import { DEALS_BOARD_INPUT, loadDealsViewParams } from "./deals-view-params";

export const metadata: Metadata = {
	title: "Deals",
};

export default function DealsPage({
	searchParams,
}: PageProps<"/[slug]/deals">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Deals</PageShellTitle>
					<PageShellDescription>
						The pipeline, and everything that has already closed.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={<DealsViewToggleFallback />}>
						<DealsViewToggle />
					</Suspense>
					<CreateDealSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Deals searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Deals({
	searchParams,
}: Pick<PageProps<"/[slug]/deals">, "searchParams">) {
	const [, values, viewValues] = await Promise.all([
		requireSession(),
		dealsSearchParams.load(searchParams),
		loadDealsViewParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		viewValues[SEARCH_PARAM.deals.view] === "board"
			? queryClient.prefetchQuery(
					trpc.deals.board.queryOptions(DEALS_BOARD_INPUT),
				)
			: queryClient.prefetchQuery(
					trpc.deals.list.queryOptions(dealsSearchParams.toInput(values)),
				),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(trpc.companies.options.queryOptions({ q: "" })),
	]);

	return (
		<HydrateClient>
			<DealsView />
		</HydrateClient>
	);
}

import { isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth/organization";
import { cache, Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DashboardSummary } from "./dashboard-summary";
import {
	OverviewGreeting,
	OverviewGreetingFallback,
} from "./overview-greeting";
import { OverviewScopeToggle } from "./overview-scope";
import {
	loadOverviewSearchParams,
	type OverviewScope,
} from "./overview-search-params";

const overviewAccess = cache(
	async (): Promise<{ admin: boolean; defaultScope: OverviewScope }> => {
		const { user } = await requireSession();
		const admin = isWorkspaceAdmin(await workspaceRoleOf(user.id));
		return { admin, defaultScope: admin ? "everyone" : "me" };
	},
);

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<Suspense fallback={<OverviewGreetingFallback />}>
						<GreetingForRole />
					</Suspense>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={null}>
						<AdminScopeToggle />
					</Suspense>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Summary searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function GreetingForRole() {
	const { defaultScope } = await overviewAccess();
	return <OverviewGreeting defaultScope={defaultScope} />;
}

async function AdminScopeToggle() {
	const { admin, defaultScope } = await overviewAccess();
	if (!admin) return null;
	return <OverviewScopeToggle defaultScope={defaultScope} />;
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	const [{ defaultScope }, params] = await Promise.all([
		overviewAccess(),
		loadOverviewSearchParams(searchParams),
	]);
	const scope = params.scope ?? defaultScope;

	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		getServerTrpc().dashboard.summary.queryOptions({ scope }),
	);

	return (
		<HydrateClient>
			<DashboardSummary defaultScope={defaultScope} />
		</HydrateClient>
	);
}

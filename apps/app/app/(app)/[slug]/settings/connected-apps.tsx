"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

export function ConnectedApps() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: apps } = useSuspenseQuery(
		trpc.oauthClients.connected.queryOptions(),
	);

	const disconnect = useMutation(
		trpc.oauthClients.disconnect.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.oauthClients.connected.queryKey(),
				});
				toast.success(
					"Disconnected. The app must sign in again to use the CRM.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Connected AI apps</CardTitle>
				<CardDescription>
					Apps such as Claude or Grok that you allowed to use the CRM as you.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{apps.length === 0 ? (
					<p className="text-muted-foreground text-sm">No app is connected.</p>
				) : (
					<ul className="flex flex-col divide-y">
						{apps.map((app) => (
							<li
								key={app.clientId}
								className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
							>
								<div className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-sm">
										{app.name ?? "Unnamed app"}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{app.redirectHosts.join(", ")} · last signed in{" "}
										<LocalRelativeTime date={app.lastTokenAt} />
									</span>
								</div>
								<Button
									size="sm"
									variant="outline"
									disabled={disconnect.isPending}
									onClick={() => disconnect.mutate({ clientId: app.clientId })}
								>
									Disconnect
								</Button>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

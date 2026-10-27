"use client";

import { authClient } from "@crm/auth/client";
import { OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const decision = z.object({ redirectURI: z.url() });

type Choice = "allow" | "deny";

export function OAuthConsent({
	consentCode,
	name,
	redirectHosts,
}: {
	consentCode: string;
	name: string;
	redirectHosts: string[];
}) {
	const [pending, setPending] = useState<Choice | null>(null);

	async function decide(choice: Choice) {
		setPending(choice);

		const { data, error } = await authClient.$fetch(
			OAUTH_PROVIDER.paths.consent,
			{
				method: "POST",
				body: { accept: choice === "allow", consent_code: consentCode },
			},
		);

		const parsed = decision.safeParse(data);
		if (error || !parsed.success) {
			setPending(null);
			toast.error("The request expired. Start again from the app.");
			return;
		}

		window.location.assign(parsed.data.redirectURI);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			{redirectHosts.length > 0 ? (
				<p className="text-muted-foreground text-sm/5">
					After you choose, you go back to {redirectHosts.join(", ")}.
				</p>
			) : null}

			<Button
				className="w-full"
				disabled={pending !== null}
				onClick={() => decide("allow")}
			>
				{pending === "allow" ? <Spinner data-icon="inline-start" /> : null}
				Allow {name}
			</Button>

			<Button
				className="w-full"
				variant="outline"
				disabled={pending !== null}
				onClick={() => decide("deny")}
			>
				{pending === "deny" ? <Spinner data-icon="inline-start" /> : null}
				Deny
			</Button>
		</div>
	);
}

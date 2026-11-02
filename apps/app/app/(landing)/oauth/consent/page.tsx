import { isOAuthAuthorizeQuery } from "@crm/auth/oauth-paths";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OAuthConsent } from "./oauth-consent";

export const metadata: Metadata = {
	title: "Allow access",
};

export const instant = false;

function signedQuery(
	params: Awaited<PageProps<"/oauth/consent">["searchParams"]>,
): URLSearchParams | null {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		for (const entry of [value].flat()) {
			if (entry !== undefined) query.append(key, entry);
		}
	}
	return isOAuthAuthorizeQuery(query) ? query : null;
}

async function describeClient(clientId: string) {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().oauthClients.describe.queryOptions({ clientId }),
		);
	} catch (error) {
		unstable_rethrow(error);
		console.error("OAuth consent: could not read the app.", error);
		return null;
	}
}

export default async function OAuthConsentPage({
	searchParams,
}: PageProps<"/oauth/consent">) {
	const { user } = await requireSession();
	const query = signedQuery(await searchParams);
	const clientId = query?.get("client_id");
	const client = clientId ? await describeClient(clientId) : null;

	if (!query || !client) {
		return (
			<AuthShell>
				<AuthHeading
					title="This link does not work"
					description="The request to connect an app is missing or expired. Start again from the app."
				/>
			</AuthShell>
		);
	}

	const name = client.name ?? "An app";

	return (
		<AuthShell>
			<AuthHeading
				title={`Allow ${name} to use the CRM?`}
				description={`${name} gets the same access as ${user.email}: it can read and change companies, contacts, deals, activities and tasks. It cannot create API keys. You can disconnect it at any time in Settings.`}
			/>

			<OAuthConsent
				oauthQuery={query.toString()}
				name={name}
				redirectHosts={client.redirectHosts}
			/>
		</AuthShell>
	);
}

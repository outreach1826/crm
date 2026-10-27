import { isOAuthAuthorizeQuery, OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
import type { MailboxProviderId } from "@crm/auth/scopes";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { PasswordSignIn } from "./password-sign-in";
import { SocialSignIn } from "./social-sign-in";
import { type SsoProvider, SsoSignIn } from "./sso-sign-in";

export const metadata: Metadata = {
	title: "Sign in",
};

type SignInOptions = {
	google: boolean;
	microsoft: boolean;
	providers: SsoProvider[];
};

async function signInOptions(): Promise<SignInOptions | null> {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().sso.signInOptions.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the sign-in options.", error);
		return null;
	}
}

async function currentSession() {
	try {
		return await getSession();
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the session.", error);
		return null;
	}
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
	return (
		<AuthShell>
			<Suspense
				fallback={
					<AuthHeading
						title="Welcome back"
						description="Sign in with your account to continue."
					/>
				}
			>
				<SignIn searchParams={searchParams} />
			</Suspense>
		</AuthShell>
	);
}

function oauthContinuation(
	params: Awaited<PageProps<"/sign-in">["searchParams"]>,
): string | null {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		for (const entry of [value].flat()) {
			if (entry !== undefined) query.append(key, entry);
		}
	}
	if (!isOAuthAuthorizeQuery(query)) return null;
	return `/api/auth${OAUTH_PROVIDER.paths.authorize}?${query}`;
}

async function SignIn({
	searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
	const [session, options, params] = await Promise.all([
		currentSession(),
		signInOptions(),
		searchParams,
	]);
	const { method } = params;
	const continueTo = oauthContinuation(params);

	if (session) {
		redirect(continueTo ?? "/");
	}

	const configured: MailboxProviderId[] = [];
	if (options?.google ?? true) configured.push("google");
	if (options?.microsoft ?? false) configured.push("microsoft");

	const providers = options?.providers ?? [];

	const insisted = configured.find((provider) => provider === method);
	const showSso = providers.length > 0 && insisted === undefined;
	const social =
		insisted !== undefined
			? [insisted]
			: providers.length === 0
				? configured
				: [];

	return (
		<>
			<AuthHeading
				title="Welcome back"
				description="Sign in with your account to continue."
			/>

			<PasswordSignIn continueTo={continueTo} />

			{showSso ? <SsoSignIn providers={providers} /> : null}
			{social.map((provider) => (
				<SocialSignIn key={provider} provider={provider} />
			))}
		</>
	);
}

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { mcp } from "better-auth/plugins";
import { env } from "./env";
import { OAUTH_PROVIDER } from "./oauth-paths";

const requireConsent = {
	id: "crm-oauth-consent",
	hooks: {
		before: [
			{
				matcher: (ctx) => ctx.path === OAUTH_PROVIDER.paths.authorize,
				handler: createAuthMiddleware(async (ctx) => ({
					context: { query: { ...ctx.query, prompt: "consent" } },
				})),
			},
		],
	},
} satisfies BetterAuthPlugin;

const loginPage = new URL(OAUTH_PROVIDER.pages.login, env.appUrl).toString();

export const oauthProviderPlugins = [
	requireConsent,
	mcp({
		loginPage,
		oidcConfig: {
			loginPage,
			consentPage: new URL(OAUTH_PROVIDER.pages.consent, env.appUrl).toString(),
			requirePKCE: true,
			codeExpiresIn: OAUTH_PROVIDER.codeSeconds,
			accessTokenExpiresIn: OAUTH_PROVIDER.accessTokenSeconds,
			refreshTokenExpiresIn: OAUTH_PROVIDER.refreshTokenSeconds,
		},
	}),
] as const;

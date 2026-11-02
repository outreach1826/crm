import { mcp } from "@better-auth/mcp";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { env } from "./env";
import { mcpResource, OAUTH_PROVIDER } from "./oauth-paths";

const requireConsent = {
	id: "crm-oauth-consent",
	hooks: {
		before: [
			{
				matcher: (ctx) =>
					ctx.path === OAUTH_PROVIDER.paths.authorize &&
					ctx.request !== undefined &&
					new URL(ctx.request.url).pathname.endsWith(
						OAUTH_PROVIDER.paths.authorize,
					),
				handler: createAuthMiddleware(async (ctx) => ({
					context: { query: { ...ctx.query, prompt: "consent" } },
				})),
			},
		],
	},
} satisfies BetterAuthPlugin;

const resource = mcpResource(env.apiUrl);

export const oauthProviderPlugins = [
	requireConsent,
	jwt({ disableSettingJwtHeader: true }),
	mcp({
		loginPage: new URL(OAUTH_PROVIDER.pages.login, env.appUrl).toString(),
		consentPage: new URL(OAUTH_PROVIDER.pages.consent, env.appUrl).toString(),
		resource,
		resources: [
			{ identifier: resource, allowedScopes: [...OAUTH_PROVIDER.scopes] },
		],
		scopes: [...OAUTH_PROVIDER.scopes],
		allowDynamicClientRegistration: true,
		allowUnauthenticatedClientRegistration: true,
		clientRegistrationDefaultApplicationType: "infer",
		codeExpiresIn: OAUTH_PROVIDER.codeSeconds,
		accessTokenExpiresIn: OAUTH_PROVIDER.accessTokenSeconds,
		refreshTokenExpiresIn: OAUTH_PROVIDER.refreshTokenSeconds,
	}),
] as const;

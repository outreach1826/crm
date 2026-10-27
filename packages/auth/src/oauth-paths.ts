const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const OAUTH_PROVIDER = {
	paths: {
		authorize: "/mcp/authorize",
		session: "/mcp/get-session",
		consent: "/oauth2/consent",
		authServerMetadata: "/.well-known/oauth-authorization-server",
	},
	pages: {
		login: "/sign-in",
		consent: "/oauth/consent",
	},
	codeSeconds: 10 * MINUTE_SECONDS,
	accessTokenSeconds: HOUR_SECONDS,
	refreshTokenSeconds: 30 * DAY_SECONDS,
	authorizeParams: ["client_id", "response_type", "redirect_uri"],
	consentParams: ["consent_code", "client_id"],
} as const;

export function isOAuthAuthorizeQuery(params: URLSearchParams): boolean {
	return OAUTH_PROVIDER.authorizeParams.every((name) => params.has(name));
}

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const OAUTH_PROVIDER = {
	paths: {
		authorize: "/oauth2/authorize",
		consent: "/oauth2/consent",
		jwks: "/jwks",
		authServerMetadata: "/.well-known/oauth-authorization-server",
	},
	pages: {
		login: "/sign-in",
		consent: "/oauth/consent",
	},
	authBasePath: "/api/auth",
	mcpPath: "/mcp",
	scopes: ["openid", "profile", "email", "offline_access"],
	codeSeconds: 10 * MINUTE_SECONDS,
	accessTokenSeconds: HOUR_SECONDS,
	refreshTokenSeconds: 30 * DAY_SECONDS,
	bridge: { header: "x-crm-mcp-secret", minSecretLength: 32 },
	signedQueryParams: ["client_id", "sig"],
} as const;

export function mcpResource(apiUrl: string): string {
	return new URL(OAUTH_PROVIDER.mcpPath, apiUrl).toString();
}

export function oauthIssuer(apiUrl: string): string {
	return new URL(OAUTH_PROVIDER.authBasePath, apiUrl).toString();
}

export function isOAuthAuthorizeQuery(params: URLSearchParams): boolean {
	return OAUTH_PROVIDER.signedQueryParams.every((name) => params.has(name));
}

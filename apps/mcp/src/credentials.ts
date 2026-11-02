import { API_KEY_HEADER, API_KEY_PREFIX } from "@crm/auth/api-keys";
import { OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
import { verifyOAuthAccessToken } from "@crm/auth/oauth-token";
import { z } from "zod";

export type Credential =
	| { kind: "api-key"; value: string }
	| { kind: "oauth"; value: string };

const BEARER = /^Bearer\s+(.+)$/i;

export function readCredential(headers: Headers): Credential | null {
	const direct = headers.get(API_KEY_HEADER)?.trim();
	if (direct) return { kind: "api-key", value: direct };

	const bearer = BEARER.exec(headers.get("authorization") ?? "")?.[1]?.trim();
	if (!bearer) return null;
	return bearer.startsWith(API_KEY_PREFIX)
		? { kind: "api-key", value: bearer }
		: { kind: "oauth", value: bearer };
}

export function credentialHeaders(
	credential: Credential,
	bridgeSecret: string | null,
): Headers {
	if (credential.kind === "api-key") {
		return new Headers({ [API_KEY_HEADER]: credential.value });
	}
	const headers = new Headers({ authorization: `Bearer ${credential.value}` });
	if (bridgeSecret) headers.set(OAUTH_PROVIDER.bridge.header, bridgeSecret);
	return headers;
}

const jwksCacheKey = {};

const jwkSet = z.object({ keys: z.array(z.looseObject({ kty: z.string() })) });

export async function isLiveOAuthToken(options: {
	apiUrl: string;
	publicUrl: string;
	token: string;
	fetch: typeof fetch;
}): Promise<boolean> {
	const verified = await verifyOAuthAccessToken(options.token, {
		publicApiUrl: options.publicUrl,
		jwksCacheKey,
		jwks: async () => {
			const response = await options.fetch(
				`${options.apiUrl}${OAUTH_PROVIDER.authBasePath}${OAUTH_PROVIDER.paths.jwks}`,
			);
			if (!response.ok) return undefined;
			const parsed = jwkSet.safeParse(await response.json().catch(() => null));
			return parsed.success ? parsed.data : undefined;
		},
	});
	return verified !== null;
}

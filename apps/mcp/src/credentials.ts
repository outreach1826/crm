import { API_KEY_HEADER, API_KEY_PREFIX } from "@crm/auth/api-keys";
import { OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
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

export function credentialHeaders(credential: Credential): Headers {
	return credential.kind === "api-key"
		? new Headers({ [API_KEY_HEADER]: credential.value })
		: new Headers({ authorization: `Bearer ${credential.value}` });
}

const tokenSession = z.object({ userId: z.string().min(1) }).nullable();

export async function isLiveOAuthToken(options: {
	apiUrl: string;
	token: string;
	fetch: typeof fetch;
}): Promise<boolean> {
	const response = await options.fetch(
		`${options.apiUrl}/api/auth${OAUTH_PROVIDER.paths.session}`,
		{ headers: { authorization: `Bearer ${options.token}` } },
	);
	if (!response.ok) return false;
	const parsed = tokenSession.safeParse(
		await response.json().catch(() => null),
	);
	return parsed.success && parsed.data !== null;
}

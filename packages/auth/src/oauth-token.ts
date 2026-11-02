import { verifyJwsAccessToken } from "better-auth/oauth2";
import { z } from "zod";
import { mcpResource, oauthIssuer } from "./oauth-paths";

const accessTokenClaims = z
	.object({
		sub: z.string().min(1),
		client_id: z.string().min(1).optional(),
		azp: z.string().min(1).optional(),
		exp: z.number(),
	})
	.transform((claims, ctx) => {
		const clientId = claims.client_id ?? claims.azp;
		if (!clientId) {
			ctx.addIssue({ code: "custom", message: "The token names no client." });
			return z.NEVER;
		}
		return {
			userId: claims.sub,
			clientId,
			expiresAt: new Date(claims.exp * 1000),
		};
	});

export type OAuthAccessToken = z.infer<typeof accessTokenClaims>;

export async function verifyOAuthAccessToken(
	token: string,
	options: {
		publicApiUrl: string;
		jwks: Parameters<typeof verifyJwsAccessToken>[1]["jwksFetch"];
		jwksCacheKey?: object;
	},
): Promise<OAuthAccessToken | null> {
	try {
		const payload = await verifyJwsAccessToken(token, {
			jwksFetch: options.jwks,
			jwksCacheKey: options.jwksCacheKey,
			verifyOptions: {
				issuer: oauthIssuer(options.publicApiUrl),
				audience: mcpResource(options.publicApiUrl),
			},
		});
		const parsed = accessTokenClaims.safeParse(payload);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

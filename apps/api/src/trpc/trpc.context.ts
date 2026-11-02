import { timingSafeEqual } from "node:crypto";
import { auth, type Session } from "@crm/auth/auth";
import { env } from "@crm/auth/env";
import { OAUTH_PROVIDER } from "@crm/auth/oauth-paths";
import { verifyOAuthAccessToken } from "@crm/auth/oauth-token";
import { db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import type { BaseTrpcContext } from "./context.types";

const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;

const jwksCacheKey = {};

export function hasBearerToken(req: Request | undefined): boolean {
	return BEARER_TOKEN.test(req?.headers.authorization ?? "");
}

export function isFromMcpServer(
	sent: string | null,
	secret: string | undefined,
): boolean {
	if (!secret || secret.length < OAUTH_PROVIDER.bridge.minSecretLength) {
		return false;
	}
	if (!sent) return false;
	const expected = Buffer.from(secret);
	const received = Buffer.from(sent);
	return (
		expected.length === received.length && timingSafeEqual(expected, received)
	);
}

async function oauthSession(headers: Headers): Promise<Session | null> {
	if (
		!isFromMcpServer(
			headers.get(OAUTH_PROVIDER.bridge.header),
			process.env.MCP_SERVER_SECRET,
		)
	) {
		return null;
	}

	const bearer = BEARER_TOKEN.exec(headers.get("authorization") ?? "")?.[1];
	if (!bearer) return null;

	const token = await verifyOAuthAccessToken(bearer, {
		publicApiUrl: env.apiUrl,
		jwks: () => auth.api.getJwks(),
		jwksCacheKey,
	});
	if (!token) return null;

	const consent = await db.oauthConsent.findFirst({
		where: { userId: token.userId, clientId: token.clientId },
		select: { id: true },
	});
	if (!consent) return null;

	const user = await db.user.findUnique({ where: { id: token.userId } });
	if (!user) return null;

	const now = new Date();
	return {
		user,
		session: {
			id: `oauth:${token.clientId}:${user.id}`,
			token: "",
			userId: user.id,
			expiresAt: token.expiresAt,
			createdAt: now,
			updatedAt: now,
			ipAddress: null,
			userAgent: null,
		},
	};
}

export async function createBaseTrpcContext(
	req: Request | undefined,
): Promise<BaseTrpcContext> {
	if (!req) return { req, session: null };

	const headers = fromNodeHeaders(req.headers);
	const session = hasBearerToken(req)
		? await oauthSession(headers).catch(() => null)
		: await auth.api.getSession({ headers }).catch(() => null);
	return { req, session };
}

@Injectable()
export class TrpcContext implements TRPCContext {
	async create(opts: ContextOptions): Promise<BaseTrpcContext> {
		const req = "req" in opts ? opts.req : undefined;
		return createBaseTrpcContext(req);
	}
}

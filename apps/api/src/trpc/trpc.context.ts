import { auth, type Session } from "@crm/auth/auth";
import { db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import type { BaseTrpcContext } from "./context.types";

const BEARER = /^Bearer\s+\S+$/i;

export function hasBearerToken(req: Request | undefined): boolean {
	return BEARER.test(req?.headers.authorization ?? "");
}

async function oauthSession(headers: Headers): Promise<Session | null> {
	const token = await auth.api.getMcpSession({ headers });
	if (!token?.userId) return null;

	const user = await db.user.findUnique({ where: { id: token.userId } });
	if (!user) return null;

	const now = new Date();
	return {
		user,
		session: {
			id: `oauth:${token.clientId}:${user.id}`,
			token: "",
			userId: user.id,
			expiresAt: token.accessTokenExpiresAt,
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

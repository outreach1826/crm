import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	connectedOAuthClientsOutput,
	describeOAuthClientOutput,
} from "./oauth-clients.contracts";

function redirectHosts(redirectUrls: string): string[] {
	const hosts = redirectUrls.split(",").flatMap((url) => {
		if (!URL.canParse(url.trim())) return [];
		return [new URL(url.trim()).host];
	});
	return [...new Set(hosts)];
}

@Injectable()
export class OAuthClientsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async describe(
		clientId: string,
	): Promise<z.infer<typeof describeOAuthClientOutput>> {
		const client = await this.db.oauthApplication.findUnique({
			where: { clientId },
			select: {
				clientId: true,
				name: true,
				redirectUrls: true,
				disabled: true,
			},
		});
		if (!client || client.disabled) return null;
		return {
			clientId: client.clientId,
			name: client.name,
			redirectHosts: redirectHosts(client.redirectUrls),
		};
	}

	async connected(
		userId: string,
	): Promise<z.infer<typeof connectedOAuthClientsOutput>> {
		const clients = await this.db.oauthApplication.findMany({
			where: { accessTokens: { some: { userId } } },
			select: {
				clientId: true,
				name: true,
				redirectUrls: true,
				accessTokens: {
					where: { userId },
					select: { createdAt: true },
					orderBy: { createdAt: "asc" },
				},
			},
		});

		return clients
			.map((client) => {
				const first = client.accessTokens[0]?.createdAt ?? new Date(0);
				const last = client.accessTokens.at(-1)?.createdAt ?? first;
				return {
					clientId: client.clientId,
					name: client.name,
					redirectHosts: redirectHosts(client.redirectUrls),
					connectedAt: first.toISOString(),
					lastTokenAt: last.toISOString(),
				};
			})
			.sort((a, b) => b.lastTokenAt.localeCompare(a.lastTokenAt));
	}

	async disconnect(userId: string, clientId: string): Promise<boolean> {
		const [tokens] = await this.db.$transaction([
			this.db.oauthAccessToken.deleteMany({ where: { userId, clientId } }),
			this.db.oauthConsent.deleteMany({ where: { userId, clientId } }),
		]);
		return tokens.count > 0;
	}
}

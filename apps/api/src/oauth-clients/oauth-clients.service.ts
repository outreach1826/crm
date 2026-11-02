import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	connectedOAuthClientsOutput,
	describeOAuthClientOutput,
} from "./oauth-clients.contracts";

function redirectHosts(redirectUris: string[]): string[] {
	const hosts = redirectUris.flatMap((url) =>
		URL.canParse(url) ? [new URL(url).host] : [],
	);
	return [...new Set(hosts)];
}

@Injectable()
export class OAuthClientsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async describe(
		clientId: string,
	): Promise<z.infer<typeof describeOAuthClientOutput>> {
		const client = await this.db.oauthClient.findUnique({
			where: { clientId },
			select: {
				clientId: true,
				name: true,
				redirectUris: true,
				disabled: true,
			},
		});
		if (!client || client.disabled) return null;
		return {
			clientId: client.clientId,
			name: client.name,
			redirectHosts: redirectHosts(client.redirectUris),
		};
	}

	async connected(
		userId: string,
	): Promise<z.infer<typeof connectedOAuthClientsOutput>> {
		const clients = await this.db.oauthClient.findMany({
			where: { oauthconsents: { some: { userId } } },
			select: {
				clientId: true,
				name: true,
				redirectUris: true,
				oauthconsents: {
					where: { userId },
					select: { createdAt: true },
					orderBy: { createdAt: "asc" },
					take: 1,
				},
				oauthrefreshtokens: {
					where: { userId },
					select: { createdAt: true },
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
		});

		return clients
			.map((client) => {
				const first = client.oauthconsents[0]?.createdAt ?? new Date(0);
				const last = client.oauthrefreshtokens[0]?.createdAt ?? first;
				return {
					clientId: client.clientId,
					name: client.name,
					redirectHosts: redirectHosts(client.redirectUris),
					connectedAt: first.toISOString(),
					lastTokenAt: last.toISOString(),
				};
			})
			.sort((a, b) => b.lastTokenAt.localeCompare(a.lastTokenAt));
	}

	async disconnect(userId: string, clientId: string): Promise<boolean> {
		const [consents] = await this.db.$transaction([
			this.db.oauthConsent.deleteMany({ where: { userId, clientId } }),
			this.db.oauthRefreshToken.deleteMany({ where: { userId, clientId } }),
			this.db.oauthAccessToken.deleteMany({ where: { userId, clientId } }),
		]);
		return consents.count > 0;
	}
}

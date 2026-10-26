import type { Db, Prisma } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sendNotification, WebPushError } from "web-push";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import type { PushDelivery, PushSubscribeInput } from "./push.contracts";
import { PUSH } from "./push-config";

export type PushMessage = {
	title: string;
	body: string;
	url: string;
	tag: string;
};

export type PushAudience =
	| { kind: "users"; userIds: string[] }
	| { kind: "everyone-except"; userId: string | null };

type Vapid = { publicKey: string; privateKey: string; subject: string };

const GONE = new Set<number>(PUSH.goneStatusCodes);

function audienceWhere(
	audience: PushAudience,
): Prisma.PushSubscriptionWhereInput {
	if (audience.kind === "users") return { userId: { in: audience.userIds } };
	return audience.userId ? { userId: { not: audience.userId } } : {};
}

@Injectable()
export class PushService {
	private readonly logger = new Logger(PushService.name);
	private readonly vapid: Vapid | null;

	constructor(
		@InjectDatabase() private readonly db: Db,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		const publicKey = config.get("VAPID_PUBLIC_KEY", { infer: true });
		const privateKey = config.get("VAPID_PRIVATE_KEY", { infer: true });
		const subject = config.get("VAPID_SUBJECT", { infer: true });

		this.vapid =
			publicKey && privateKey && subject
				? { publicKey, privateKey, subject }
				: null;

		if (!this.vapid) {
			this.logger.log(
				"Push notifications are off: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to turn them on.",
			);
		}
	}

	publicKey(): string | null {
		return this.vapid?.publicKey ?? null;
	}

	async subscribe(userId: string, input: PushSubscribeInput): Promise<void> {
		const device = {
			userId,
			p256dh: input.keys.p256dh,
			auth: input.keys.auth,
			userAgent: input.userAgent ?? null,
		};

		await this.db.pushSubscription.upsert({
			where: { endpoint: input.endpoint },
			create: { endpoint: input.endpoint, ...device },
			update: device,
		});

		this.logger.log({ message: "Push device subscribed", userId });
	}

	async unsubscribe(userId: string, endpoint: string): Promise<number> {
		const { count } = await this.db.pushSubscription.deleteMany({
			where: { endpoint, userId },
		});
		return count;
	}

	notify(audience: PushAudience, message: PushMessage): void {
		void this.deliver(audience, message).catch((error: unknown) => {
			this.logger.warn({
				message: "Push delivery failed",
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}

	async deliver(
		audience: PushAudience,
		message: PushMessage,
	): Promise<PushDelivery> {
		const outcome: PushDelivery = { sent: 0, failed: 0, removed: 0 };
		const vapid = this.vapid;
		if (!vapid) return outcome;

		const devices = await this.db.pushSubscription.findMany({
			where: audienceWhere(audience),
			select: { id: true, endpoint: true, p256dh: true, auth: true },
		});
		if (devices.length === 0) return outcome;

		const payload = JSON.stringify(message);

		await Promise.all(
			devices.map(async (device) => {
				try {
					await sendNotification(
						{
							endpoint: device.endpoint,
							keys: { p256dh: device.p256dh, auth: device.auth },
						},
						payload,
						{
							vapidDetails: vapid,
							TTL: PUSH.delivery.ttlSeconds,
							urgency: PUSH.delivery.urgency,
						},
					);
					outcome.sent += 1;
					await this.db.pushSubscription.update({
						where: { id: device.id },
						data: { lastSentAt: new Date() },
					});
				} catch (error) {
					if (error instanceof WebPushError && GONE.has(error.statusCode)) {
						await this.db.pushSubscription.deleteMany({
							where: { id: device.id },
						});
						outcome.removed += 1;
						return;
					}
					outcome.failed += 1;
					this.logger.warn({
						message: "Push to one device failed",
						deviceId: device.id,
						status: error instanceof WebPushError ? error.statusCode : null,
					});
				}
			}),
		);

		return outcome;
	}
}

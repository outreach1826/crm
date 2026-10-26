import type { Db, DealStage } from "@crm/db";
import { DEAL_STAGE_LABELS, LOSING_DEAL_STAGES } from "@crm/db/deal-stage";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { PushService } from "./push.service";

const LOSING = new Set<DealStage>(LOSING_DEAL_STAGES);

const UNKNOWN_ACTOR = "Someone";

function dealUrl(dealId: string): string {
	return `/deals?record=deal:${dealId}`;
}

function stageTitle(stage: DealStage): string {
	if (stage === "CLOSED_WON") return "Deal won";
	if (LOSING.has(stage)) return "Deal lost";
	return "Deal moved";
}

@Injectable()
export class DealNotifications {
	private readonly logger = new Logger(DealNotifications.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly push: PushService,
	) {}

	created(dealId: string, actorId: string | null): Promise<void> {
		return this.run(async () => {
			const [deal, actor] = await Promise.all([
				this.deal(dealId),
				this.actorName(actorId),
			]);
			if (!deal) return;

			this.push.notify(
				{ kind: "everyone-except", userId: actorId },
				{
					title: "New deal",
					body: `${actor} added ${deal.name} · ${deal.company.name}`,
					url: dealUrl(dealId),
					tag: `deal:${dealId}`,
				},
			);
		});
	}

	stageChanged(dealId: string, to: DealStage, actorId: string): Promise<void> {
		return this.run(async () => {
			const [deal, actor] = await Promise.all([
				this.deal(dealId),
				this.actorName(actorId),
			]);
			if (!deal) return;

			this.push.notify(
				{ kind: "everyone-except", userId: actorId },
				{
					title: stageTitle(to),
					body: `${actor} moved ${deal.name} to ${DEAL_STAGE_LABELS[to]}`,
					url: dealUrl(dealId),
					tag: `deal:${dealId}`,
				},
			);
		});
	}

	assigned(
		dealId: string,
		ownerId: string,
		actorId: string | null,
	): Promise<void> {
		if (ownerId === actorId) return Promise.resolve();

		return this.run(async () => {
			const [deal, actor] = await Promise.all([
				this.deal(dealId),
				this.actorName(actorId),
			]);
			if (!deal) return;

			this.push.notify(
				{ kind: "users", userIds: [ownerId] },
				{
					title: "Deal assigned to you",
					body: `${actor} gave you ${deal.name} · ${deal.company.name}`,
					url: dealUrl(dealId),
					tag: `deal:${dealId}`,
				},
			);
		});
	}

	bulkAssigned(
		ownerId: string,
		count: number,
		actorId: string | null,
	): Promise<void> {
		if (ownerId === actorId || count === 0) return Promise.resolve();

		return this.run(async () => {
			const actor = await this.actorName(actorId);

			this.push.notify(
				{ kind: "users", userIds: [ownerId] },
				{
					title: "Deals assigned to you",
					body:
						count === 1
							? `${actor} gave you a deal`
							: `${actor} gave you ${count} deals`,
					url: "/deals",
					tag: "deals:assigned",
				},
			);
		});
	}

	private run(work: () => Promise<void>): Promise<void> {
		return work().catch((error: unknown) => {
			this.logger.warn({
				message: "Deal notification failed",
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}

	private deal(dealId: string) {
		return this.db.deal.findUnique({
			where: { id: dealId },
			select: { name: true, company: { select: { name: true } } },
		});
	}

	private async actorName(actorId: string | null): Promise<string> {
		if (!actorId) return UNKNOWN_ACTOR;

		const user = await this.db.user.findUnique({
			where: { id: actorId },
			select: { name: true },
		});

		return user?.name || UNKNOWN_ACTOR;
	}
}

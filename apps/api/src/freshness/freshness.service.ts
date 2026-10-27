import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

type Latest = {
	_max: { updatedAt: Date | null };
	_count: { _all: number };
};

function part(latest: Latest): string {
	return `${latest._count._all}:${latest._max.updatedAt?.getTime() ?? 0}`;
}

@Injectable()
export class FreshnessService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async stamp(): Promise<string> {
		const latest = {
			_max: { updatedAt: true },
			_count: { _all: true },
		} as const;

		const parts = await Promise.all([
			this.db.deal.aggregate(latest),
			this.db.company.aggregate(latest),
			this.db.contact.aggregate(latest),
			this.db.activity.aggregate(latest),
		]);

		return parts.map(part).join("|");
	}
}

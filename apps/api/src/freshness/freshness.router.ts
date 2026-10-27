import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { freshnessStampOutput } from "./freshness.contracts";
import { FreshnessService } from "./freshness.service";

@Router({ alias: "freshness" })
@UseMiddlewares(AuthMiddleware)
export class FreshnessRouter {
	constructor(
		@Inject(FreshnessService) private readonly freshness: FreshnessService,
	) {}

	@Query({ output: freshnessStampOutput })
	async stamp() {
		return { stamp: await this.freshness.stamp() };
	}
}

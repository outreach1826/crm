import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { FreshnessRouter } from "./freshness.router";
import { FreshnessService } from "./freshness.service";

@Module({
	imports: [TrpcModule],
	providers: [FreshnessService, FreshnessRouter],
})
export class FreshnessModule {}

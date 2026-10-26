import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { DealNotifications } from "./deal-notifications.service";
import { PushRouter } from "./push.router";
import { PushService } from "./push.service";

@Module({
	imports: [TrpcModule],
	providers: [PushService, DealNotifications, PushRouter],
	exports: [DealNotifications],
})
export class PushModule {}

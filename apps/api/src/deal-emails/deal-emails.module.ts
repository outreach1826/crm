import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { DealEmailsRouter } from "./deal-emails.router";
import { DealEmailsService } from "./deal-emails.service";

@Module({
	imports: [TrpcModule, MailboxModule, ActivitiesModule],
	providers: [DealEmailsService, DealEmailsRouter],
})
export class DealEmailsModule {}

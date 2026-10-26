import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CurrencyModule } from "../currency/currency.module";
import { FieldsModule } from "../fields/fields.module";
import { PushModule } from "../push/push.module";
import { TrpcModule } from "../trpc/trpc.module";
import { DealsRouter } from "./deals.router";
import { DealsService } from "./deals.service";

@Module({
	imports: [AgentModule, FieldsModule, TrpcModule, CurrencyModule, PushModule],
	providers: [DealsService, DealsRouter],
	exports: [DealsService],
})
export class DealsModule {}

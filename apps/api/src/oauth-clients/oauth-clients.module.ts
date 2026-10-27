import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { OAuthClientsRouter } from "./oauth-clients.router";
import { OAuthClientsService } from "./oauth-clients.service";

@Module({
	imports: [TrpcModule],
	providers: [OAuthClientsService, OAuthClientsRouter],
})
export class OAuthClientsModule {}

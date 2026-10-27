import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SessionOnlyMiddleware } from "../trpc/middlewares/session-only.middleware";
import {
	connectedOAuthClientsOutput,
	describeOAuthClientInput,
	describeOAuthClientOutput,
	disconnectOAuthClientInput,
	disconnectOAuthClientOutput,
} from "./oauth-clients.contracts";
import { OAuthClientsService } from "./oauth-clients.service";

@Router({ alias: "oauthClients" })
@UseMiddlewares(AuthMiddleware, SessionOnlyMiddleware)
export class OAuthClientsRouter {
	constructor(
		@Inject(OAuthClientsService) private readonly clients: OAuthClientsService,
	) {}

	@Query({ input: describeOAuthClientInput, output: describeOAuthClientOutput })
	async describe(@Input() input: z.infer<typeof describeOAuthClientInput>) {
		return this.clients.describe(input.clientId);
	}

	@Query({ output: connectedOAuthClientsOutput })
	async connected(@Ctx() ctx: AuthedTrpcContext) {
		return this.clients.connected(ctx.user.id);
	}

	@Mutation({
		input: disconnectOAuthClientInput,
		output: disconnectOAuthClientOutput,
	})
	async disconnect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof disconnectOAuthClientInput>,
	) {
		return {
			disconnected: await this.clients.disconnect(ctx.user.id, input.clientId),
		};
	}
}

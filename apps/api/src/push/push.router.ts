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
import { restMeta } from "../trpc/openapi";
import {
	pushConfigOutput,
	pushDeliveryOutput,
	pushEndpointInput,
	pushRemovedOutput,
	pushSavedOutput,
	pushSubscribeInput,
} from "./push.contracts";
import { PushService } from "./push.service";

@Router({ alias: "push" })
@UseMiddlewares(AuthMiddleware)
export class PushRouter {
	constructor(@Inject(PushService) private readonly push: PushService) {}

	@Query({
		output: pushConfigOutput,
		meta: restMeta("GET", "/push/config", ["Push"]),
	})
	async config() {
		return { publicKey: this.push.publicKey() };
	}

	@Mutation({
		input: pushSubscribeInput,
		output: pushSavedOutput,
		meta: restMeta("POST", "/push/devices", ["Push"]),
	})
	async subscribe(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pushSubscribeInput>,
	) {
		await this.push.subscribe(ctx.user.id, input);
		return { saved: true as const };
	}

	@Mutation({
		input: pushEndpointInput,
		output: pushRemovedOutput,
		meta: restMeta("POST", "/push/devices/remove", ["Push"]),
	})
	async unsubscribe(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("endpoint") endpoint: string,
	) {
		return { removed: await this.push.unsubscribe(ctx.user.id, endpoint) };
	}

	@Mutation({
		output: pushDeliveryOutput,
		meta: restMeta("POST", "/push/test", ["Push"]),
	})
	async test(@Ctx() ctx: AuthedTrpcContext) {
		return this.push.deliver(
			{ kind: "users", userIds: [ctx.user.id] },
			{
				title: "Notifications are on",
				body: "This device will get updates when deals are created, move stage, or are assigned to you.",
				url: "/deals",
				tag: "push:test",
			},
		);
	}
}

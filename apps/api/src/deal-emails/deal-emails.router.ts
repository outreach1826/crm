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
	importInput,
	importOutput,
	listInput,
	listOutput,
} from "./deal-emails.contracts";
import { DealEmailsService } from "./deal-emails.service";

@Router({ alias: "dealEmails" })
@UseMiddlewares(AuthMiddleware)
export class DealEmailsRouter {
	constructor(
		@Inject(DealEmailsService) private readonly emails: DealEmailsService,
	) {}

	@Query({
		input: listInput,
		output: listOutput,
		meta: restMeta("GET", "/deals/{dealId}/emails", ["Deals"]),
	})
	async list(@Input() input: z.infer<typeof listInput>) {
		return this.emails.list(input);
	}

	@Mutation({
		input: importInput,
		output: importOutput,
		meta: restMeta("POST", "/deal-emails/import", ["Deals"]),
	})
	async import(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof importInput>,
	) {
		return this.emails.import(input, ctx.user.id);
	}
}

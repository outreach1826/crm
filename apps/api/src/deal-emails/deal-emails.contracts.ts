import { z } from "zod";
import { DEAL_EMAILS } from "./deal-emails.config";

const LIMITS = DEAL_EMAILS.import;

const address = z.string().trim().toLowerCase().max(320).pipe(z.email());

const person = z.object({
	email: address,
	name: z.string().trim().max(200).nullish(),
});

export const importedEmail = z.object({
	dealId: z.string().trim().min(1),
	mailbox: address,
	gmailMessageId: z.string().trim().min(1).max(200),
	gmailThreadId: z.string().trim().min(1).max(200),
	rfcMessageId: z.string().trim().min(1).max(998).nullish(),
	from: person,
	to: z.array(person).max(LIMITS.maxRecipients).default([]),
	cc: z.array(person).max(LIMITS.maxRecipients).default([]),
	subject: z.string().max(998).nullish(),
	body: z.string().max(LIMITS.maxBodyChars).default(""),
	sentAt: z.iso.datetime({ offset: true }),
	direction: z.enum(["sent", "received"]),
});

export const importInput = z.object({
	messages: z.array(importedEmail).min(1).max(LIMITS.maxMessages),
});

const importStatus = z.enum(["imported", "skipped", "failed"]);

export const importOutput = z.object({
	imported: z.number(),
	skipped: z.number(),
	failed: z.number(),
	results: z.array(
		z.object({
			mailbox: z.string(),
			gmailMessageId: z.string(),
			status: importStatus,
			reason: z.string().nullable(),
			threadId: z.string().nullable(),
		}),
	),
});

export const listInput = z.object({
	dealId: z.string().trim().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(DEAL_EMAILS.list.maxThreads)
		.default(DEAL_EMAILS.list.defaultThreads),
});

const listedPerson = z.object({
	email: z.string(),
	name: z.string().nullable(),
});

export const listOutput = z.object({
	dealId: z.string(),
	totalThreads: z.number(),
	page: z.number(),
	pageSize: z.number(),
	threads: z.array(
		z.object({
			id: z.string(),
			subject: z.string().nullable(),
			firstMessageAt: z.string(),
			lastMessageAt: z.string(),
			messageCount: z.number(),
			messages: z.array(
				z.object({
					id: z.string(),
					mailbox: z.string().nullable(),
					gmailMessageId: z.string().nullable(),
					gmailThreadId: z.string().nullable(),
					direction: z.enum(["sent", "received"]),
					from: listedPerson,
					to: z.array(listedPerson),
					cc: z.array(listedPerson),
					subject: z.string().nullable(),
					body: z.string().nullable(),
					sentAt: z.string(),
				}),
			),
		}),
	),
});

export type ImportedEmail = z.infer<typeof importedEmail>;
export type ImportInput = z.infer<typeof importInput>;
export type ImportOutput = z.infer<typeof importOutput>;
export type ListInput = z.infer<typeof listInput>;
export type ListOutput = z.infer<typeof listOutput>;

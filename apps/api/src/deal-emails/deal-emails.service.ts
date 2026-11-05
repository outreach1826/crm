import {
	ActivityType,
	type Db,
	EmailDirection,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivitiesService } from "../activities/activities.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxMatchService } from "../mailbox/mailbox-match.service";
import { normaliseMessageId, snippetOf } from "../mailbox/message-text";
import { workDomain } from "../mailbox/participants";
import { recipientsOf } from "../mailbox/stored-recipients";
import type {
	ImportedEmail,
	ImportInput,
	ImportOutput,
	ListInput,
	ListOutput,
} from "./deal-emails.contracts";

type Result = ImportOutput["results"][number];

type DealTarget = {
	id: string;
	companyId: string;
	archived: boolean;
};

type Identity = { addresses: Set<string>; domains: Set<string> };

const NO_SUBJECT = "(no subject)";

export function threadKey(mailbox: string, gmailThreadId: string): string {
	return `gmail-thread:${mailbox}:${gmailThreadId}`;
}

export function messageKey(email: ImportedEmail): string {
	return email.rfcMessageId
		? normaliseMessageId(email.rfcMessageId)
		: `gmail:${email.mailbox}:${email.gmailMessageId}`;
}

function chronological(messages: readonly ImportedEmail[]): ImportedEmail[] {
	return messages
		.map((message, index) => ({ message, index }))
		.sort(
			(a, b) =>
				Date.parse(a.message.sentAt) - Date.parse(b.message.sentAt) ||
				a.index - b.index,
		)
		.map(({ message }) => message);
}

@Injectable()
export class DealEmailsService {
	private readonly logger = new Logger(DealEmailsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly activities: ActivitiesService,
	) {}

	async import(input: ImportInput, userId: string): Promise<ImportOutput> {
		const messages = chronological(input.messages);
		const [deals, identity] = await Promise.all([
			this.deals(messages),
			this.match.internalIdentity(),
		]);

		const results: Result[] = [];
		for (const message of messages) {
			results.push(await this.importOne(message, deals, identity, userId));
		}

		const count = (status: Result["status"]) =>
			results.filter((result) => result.status === status).length;

		const output = {
			imported: count("imported"),
			skipped: count("skipped"),
			failed: count("failed"),
			results,
		};

		this.logger.log({
			message: "Deal emails imported",
			userId,
			imported: output.imported,
			skipped: output.skipped,
			failed: output.failed,
		});

		return output;
	}

	async list(input: ListInput): Promise<ListOutput> {
		const deal = await this.db.deal.findUnique({
			where: { id: input.dealId },
			select: { id: true },
		});
		if (!deal) throw new NotFoundException(`No deal with id ${input.dealId}.`);

		const where: Prisma.ActivityWhereInput = {
			AND: [
				await this.activities.dealAnchor(input.dealId),
				{ type: ActivityType.EMAIL, emailThreadId: { not: null } },
			],
		};

		const [totalThreads, rows] = await Promise.all([
			this.db.activity.count({ where }),
			this.db.activity.findMany({
				where,
				orderBy: [{ emailThread: { firstMessageAt: "asc" } }, { id: "asc" }],
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
				select: {
					emailThread: {
						select: {
							id: true,
							subject: true,
							firstMessageAt: true,
							lastMessageAt: true,
							messageCount: true,
							messages: {
								orderBy: [{ sentAt: "asc" }, { id: "asc" }],
								select: {
									id: true,
									mailbox: true,
									gmailMessageId: true,
									gmailThreadId: true,
									direction: true,
									fromEmail: true,
									fromName: true,
									recipients: true,
									subject: true,
									body: true,
									sentAt: true,
								},
							},
						},
					},
				},
			}),
		]);

		return {
			dealId: input.dealId,
			totalThreads,
			page: input.page,
			pageSize: input.pageSize,
			threads: rows.flatMap(({ emailThread: thread }) =>
				thread
					? [
							{
								id: thread.id,
								subject: thread.subject,
								firstMessageAt: thread.firstMessageAt.toISOString(),
								lastMessageAt: thread.lastMessageAt.toISOString(),
								messageCount: thread.messageCount,
								messages: thread.messages.map((message) => {
									const recipients = recipientsOf(message.recipients);
									const people = (kind: string) =>
										recipients
											.filter((recipient) => recipient.kind === kind)
											.map((recipient) => ({
												email: recipient.email,
												name: recipient.name,
											}));

									return {
										id: message.id,
										mailbox: message.mailbox,
										gmailMessageId: message.gmailMessageId,
										gmailThreadId: message.gmailThreadId,
										direction:
											message.direction === EmailDirection.OUTBOUND
												? ("sent" as const)
												: ("received" as const),
										from: { email: message.fromEmail, name: message.fromName },
										to: people("to"),
										cc: people("cc"),
										subject: message.subject,
										body: message.body,
										sentAt: message.sentAt.toISOString(),
									};
								}),
							},
						]
					: [],
			),
		};
	}

	private async deals(
		messages: readonly ImportedEmail[],
	): Promise<Map<string, DealTarget>> {
		const ids = [...new Set(messages.map((message) => message.dealId))];
		const rows = await this.db.deal.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				companyId: true,
				archivedAt: true,
				company: { select: { archivedAt: true } },
			},
		});

		return new Map(
			rows.map((row) => [
				row.id,
				{
					id: row.id,
					companyId: row.companyId,
					archived: row.archivedAt !== null || row.company.archivedAt !== null,
				},
			]),
		);
	}

	private async importOne(
		email: ImportedEmail,
		deals: Map<string, DealTarget>,
		identity: Identity,
		userId: string,
	): Promise<Result> {
		const result = (
			status: Result["status"],
			reason: string | null,
			threadId: string | null = null,
		): Result => ({
			mailbox: email.mailbox,
			gmailMessageId: email.gmailMessageId,
			status,
			reason,
			threadId,
		});

		const deal = deals.get(email.dealId);
		if (!deal) {
			return result(
				"failed",
				`No deal with id ${email.dealId}. The import never creates deals.`,
			);
		}
		if (deal.archived) {
			return result("failed", `Deal ${email.dealId} is archived.`);
		}
		if (!this.isTeamMailbox(email.mailbox, identity)) {
			return result("failed", `${email.mailbox} is not a team mailbox.`);
		}

		const duplicate = await this.db.emailMessage.findUnique({
			where: {
				mailbox_gmailMessageId: {
					mailbox: email.mailbox,
					gmailMessageId: email.gmailMessageId,
				},
			},
			select: { threadId: true },
		});
		if (duplicate) {
			await this.linkThread(duplicate.threadId, deal.id);
			return result(
				"skipped",
				"Already imported from this mailbox.",
				duplicate.threadId,
			);
		}

		const rfcMessageId = messageKey(email);
		const sameMessage = await this.db.emailMessage.findUnique({
			where: { rfcMessageId },
			select: { threadId: true },
		});
		if (sameMessage) {
			await this.linkThread(sameMessage.threadId, deal.id);
			return result(
				"skipped",
				"Already stored from another mailbox with the same Message-ID.",
				sameMessage.threadId,
			);
		}

		try {
			const threadId = await this.write(email, rfcMessageId, deal, userId);
			return result("imported", null, threadId);
		} catch (error) {
			if (
				error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				return result("skipped", "Imported at the same time by another call.");
			}

			this.logger.error(
				{
					message: "A deal email could not be imported",
					dealId: deal.id,
					gmailMessageId: email.gmailMessageId,
				},
				error instanceof Error ? error.stack : String(error),
			);
			return result(
				"failed",
				error instanceof Error ? error.message : "The import failed.",
			);
		}
	}

	private isTeamMailbox(mailbox: string, identity: Identity): boolean {
		if (identity.addresses.has(mailbox)) return true;
		const domain = workDomain(mailbox);
		return domain !== null && identity.domains.has(domain);
	}

	private async write(
		email: ImportedEmail,
		rfcMessageId: string,
		deal: DealTarget,
		userId: string,
	): Promise<string> {
		const sentAt = new Date(email.sentAt);
		const contactId = await this.contactFor(email, deal.companyId);

		return this.db.$transaction(async (tx) => {
			const sibling = await tx.emailMessage.findFirst({
				where: { mailbox: email.mailbox, gmailThreadId: email.gmailThreadId },
				select: { threadId: true },
			});

			const thread = sibling
				? { id: sibling.threadId }
				: await tx.emailThread.upsert({
						where: {
							rootMessageId: threadKey(email.mailbox, email.gmailThreadId),
						},
						create: {
							rootMessageId: threadKey(email.mailbox, email.gmailThreadId),
							subject: email.subject ?? null,
							companyId: deal.companyId,
							contactId,
							firstMessageAt: sentAt,
							lastMessageAt: sentAt,
							messageCount: 0,
						},
						update: {},
						select: { id: true },
					});

			await tx.emailMessage.create({
				data: {
					threadId: thread.id,
					rfcMessageId,
					syncedByUserId: userId,
					mailbox: email.mailbox,
					gmailMessageId: email.gmailMessageId,
					gmailThreadId: email.gmailThreadId,
					direction:
						email.direction === "sent"
							? EmailDirection.OUTBOUND
							: EmailDirection.INBOUND,
					fromEmail: email.from.email,
					fromName: email.from.name ?? null,
					recipients: [
						...email.to.map((person) => ({
							email: person.email,
							name: person.name ?? null,
							kind: "to",
						})),
						...email.cc.map((person) => ({
							email: person.email,
							name: person.name ?? null,
							kind: "cc",
						})),
					],
					subject: email.subject ?? null,
					snippet: snippetOf(email.body),
					body: email.body || null,
					sentAt,
				},
			});

			const stats = await tx.emailMessage.aggregate({
				where: { threadId: thread.id },
				_count: { _all: true },
				_min: { sentAt: true },
				_max: { sentAt: true },
			});
			const firstMessageAt = stats._min.sentAt ?? sentAt;
			const lastMessageAt = stats._max.sentAt ?? sentAt;
			const earliest = sentAt.getTime() <= firstMessageAt.getTime();

			const changes: Prisma.EmailThreadUpdateInput = {
				messageCount: stats._count._all,
				firstMessageAt,
				lastMessageAt,
			};
			if (earliest) changes.subject = email.subject ?? null;

			const updated = await tx.emailThread.update({
				where: { id: thread.id },
				data: changes,
				select: { subject: true, companyId: true, contactId: true },
			});

			const latest = await tx.emailMessage.findFirst({
				where: { threadId: thread.id },
				orderBy: [{ sentAt: "desc" }, { id: "desc" }],
				select: { snippet: true },
			});

			await tx.activity.upsert({
				where: { emailThreadId: thread.id },
				create: {
					type: ActivityType.EMAIL,
					subject: updated.subject ?? NO_SUBJECT,
					body: latest?.snippet ?? null,
					occurredAt: lastMessageAt,
					createdAt: lastMessageAt,
					dealId: deal.id,
					companyId: updated.companyId ?? deal.companyId,
					contactId: updated.contactId,
					createdById: userId,
					emailThreadId: thread.id,
					meta: { synced: true, source: "gmail", imported: true },
				},
				update: {
					subject: updated.subject ?? NO_SUBJECT,
					body: latest?.snippet ?? null,
					occurredAt: lastMessageAt,
				},
			});

			await tx.activity.updateMany({
				where: { emailThreadId: thread.id, dealId: null },
				data: { dealId: deal.id },
			});

			return thread.id;
		});
	}

	private async linkThread(threadId: string, dealId: string): Promise<void> {
		await this.db.activity.updateMany({
			where: { emailThreadId: threadId, dealId: null },
			data: { dealId },
		});
	}

	private async contactFor(
		email: ImportedEmail,
		companyId: string,
	): Promise<string | null> {
		const addresses = [email.from, ...email.to, ...email.cc].map(
			(person) => person.email,
		);
		const contact = await this.db.contact.findFirst({
			where: {
				companyId,
				archivedAt: null,
				email: { in: addresses, mode: "insensitive" },
			},
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});
		return contact?.id ?? null;
	}
}

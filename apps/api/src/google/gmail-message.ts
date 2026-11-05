import {
	normaliseMessageId,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import type { IncomingMessage } from "../mailbox/thread-writer.service";
import type { GmailMessage } from "./gmail.client";
import {
	type GmailHeader,
	header,
	plainTextBody,
	rootMessageId,
} from "./gmail-mime";

export function parseGmailMessage(
	message: GmailMessage,
): IncomingMessage | null {
	const headers = message.payload?.headers;

	const rawMessageId = header(headers, "message-id");
	if (!rawMessageId) return null;

	const from = parseAddress(header(headers, "from") ?? "");
	if (!from) return null;

	const sentAt = sentAtOf(message, headers);
	if (!sentAt) return null;

	const rootId = rootMessageId(headers) ?? normaliseMessageId(rawMessageId);

	const to = parseAddressList(header(headers, "to")).map((person) => ({
		email: person.email,
		name: person.name,
		kind: "to" as const,
	}));

	const cc = parseAddressList(header(headers, "cc")).map((person) => ({
		email: person.email,
		name: person.name,
		kind: "cc" as const,
	}));

	const body = stripQuotedHistory(plainTextBody(message.payload));

	return {
		rfcMessageId: normaliseMessageId(rawMessageId),
		rootId,
		subject: header(headers, "subject"),
		from,
		recipients: [...to, ...cc],
		body,
		sentAt,
		gmailMessageId: message.id ?? null,
	};
}

function sentAtOf(
	message: GmailMessage,
	headers: readonly GmailHeader[] | undefined,
): Date | null {
	if (message.internalDate) {
		const at = new Date(Number(message.internalDate));
		if (!Number.isNaN(at.getTime())) return at;
	}

	const raw = header(headers, "date");
	if (!raw) return null;

	const at = new Date(raw);
	return Number.isNaN(at.getTime()) ? null : at;
}

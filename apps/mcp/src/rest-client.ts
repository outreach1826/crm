import { API_KEY_HEADER } from "@crm/auth/api-keys";
import { z } from "zod";
import { MCP } from "./mcp-config";

export type Json = z.infer<ReturnType<typeof z.json>>;

type QueryValue = string | number | boolean | undefined;

export type CrmRequest = {
	method: "GET" | "POST" | "PATCH";
	path: string;
	query?: Record<string, QueryValue>;
	body?: Json;
};

export class CrmApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

const errorBody = z.object({ message: z.string() });

function describeFailure(status: number, body: Json): string {
	const parsed = errorBody.safeParse(body);
	if (parsed.success) return parsed.data.message;
	if (status === 401) return "The CRM refused the API key.";
	if (status === 403) return "The API key cannot do this.";
	if (status === 404) return "The CRM has no record with that id.";
	return `The CRM answered with status ${status}.`;
}

async function readJson(response: Response): Promise<Json> {
	const text = await response.text();
	if (!text) return null;
	const parsed = z.json().safeParse(JSON.parse(text));
	return parsed.success ? parsed.data : null;
}

export class CrmClient {
	constructor(
		private readonly options: {
			apiUrl: string;
			apiKey: string;
			fetch: typeof fetch;
		},
	) {}

	async call(request: CrmRequest): Promise<Json> {
		const url = new URL(
			`${this.options.apiUrl}${MCP.restPrefix}${request.path}`,
		);
		for (const [key, value] of Object.entries(request.query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		const headers = new Headers({ [API_KEY_HEADER]: this.options.apiKey });
		const sendsBody = request.method !== "GET";
		if (sendsBody) headers.set("content-type", "application/json");

		const response = await this.options.fetch(url, {
			method: request.method,
			headers,
			body: sendsBody ? JSON.stringify(request.body ?? {}) : undefined,
			signal: AbortSignal.timeout(MCP.requestTimeoutMs),
		});

		const body = await readJson(response).catch(() => null);
		if (!response.ok) {
			throw new CrmApiError(
				response.status,
				describeFailure(response.status, body),
			);
		}
		return body;
	}
}

import { db } from "@crm/db";
import { readContextDevKeys } from "@crm/db/settings";

const outOfCreditsUntil = new Map<string, number>();

export function nextMonthStart(now: number): number {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function isOutOfCredits(status: number, body: string): boolean {
	if (status === 402) return true;
	return status === 429 && /credit/i.test(body) && !/rate/i.test(body);
}

export function markOutOfCredits(key: string, now = Date.now()): void {
	outOfCreditsUntil.set(key, nextMonthStart(now));
}

export function usableKeys(
	keys: readonly string[],
	now = Date.now(),
): string[] {
	return keys.filter((key) => (outOfCreditsUntil.get(key) ?? 0) <= now);
}

export async function contextDevKeys(): Promise<string[]> {
	try {
		return await readContextDevKeys(db);
	} catch (error) {
		console.error(
			`[agent] could not read the Context.dev keys from the database: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return [];
	}
}

export async function usableContextDevKeys(): Promise<string[]> {
	return usableKeys(await contextDevKeys());
}

export function rotatingFetch(
	keys: () => Promise<string[]>,
	send: typeof fetch = fetch,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
	return async (input, init) => {
		let refused: Response | null = null;

		for (const key of await keys()) {
			const headers = new Headers(init?.headers);
			headers.set("authorization", `Bearer ${key}`);
			const response = await send(input, { ...init, headers });
			if (response.ok) return response;

			const body = await response.clone().text();
			if (!isOutOfCredits(response.status, body)) return response;

			markOutOfCredits(key);
			refused = response;
		}

		return (
			refused ??
			Response.json(
				{ message: "Every Context.dev key is out of credits this month." },
				{ status: 402 },
			)
		);
	};
}

import { describe, expect, it } from "bun:test";
import {
	isOutOfCredits,
	nextMonthStart,
	rotatingFetch,
	usableKeys,
} from "../agent/lib/context-keys";

type Sent = { key: string | null };

function fakeContext(spent: Set<string>) {
	const sent: Sent[] = [];
	const send = async (_input: string | URL | Request, init?: RequestInit) => {
		const key =
			new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ??
			null;
		sent.push({ key });
		return key && spent.has(key)
			? Response.json({ message: "Out of credits" }, { status: 402 })
			: Response.json({ ok: true });
	};
	return { sent, send: Object.assign(send, { preconnect: fetch.preconnect }) };
}

describe("sharing the team's Context.dev keys", () => {
	it("moves on to the next key when one is out of credits", async () => {
		const { sent, send } = fakeContext(new Set(["david"]));
		const call = rotatingFetch(async () => usableKeys(["david", "cody"]), send);

		const response = await call("https://api.context.dev/v1/x", {
			headers: { authorization: "Bearer placeholder" },
		});

		expect(response.status).toBe(200);
		expect(sent.map((s) => s.key)).toEqual(["david", "cody"]);
	});

	it("skips a spent key until the next month starts", async () => {
		const { sent, send } = fakeContext(new Set(["daan-spent"]));
		const call = rotatingFetch(
			async () => usableKeys(["daan-spent", "spare"]),
			send,
		);

		await call("https://api.context.dev/v1/x");
		await call("https://api.context.dev/v1/x");

		expect(sent.map((s) => s.key)).toEqual(["daan-spent", "spare", "spare"]);
		expect(usableKeys(["daan-spent"], nextMonthStart(Date.now()))).toEqual([
			"daan-spent",
		]);
	});

	it("passes any other failure straight back", async () => {
		const send = Object.assign(
			async () => Response.json({ message: "Not found" }, { status: 404 }),
			{ preconnect: fetch.preconnect },
		);
		const call = rotatingFetch(async () => ["one", "two"], send);
		expect((await call("https://api.context.dev/v1/x")).status).toBe(404);
	});

	it("answers 402 when every key is spent", async () => {
		const call = rotatingFetch(async () => []);
		expect((await call("https://api.context.dev/v1/x")).status).toBe(402);
	});

	it("reads a 429 as spent only when it is about credits", () => {
		expect(isOutOfCredits(402, "")).toBe(true);
		expect(isOutOfCredits(429, "Monthly credit quota reached")).toBe(true);
		expect(isOutOfCredits(429, "Slow down")).toBe(false);
		expect(
			isOutOfCredits(429, "Rate limit exceeded. Upgrade your plan for more."),
		).toBe(false);
		expect(isOutOfCredits(429, "Rate limit: 2 credits per second")).toBe(false);
		expect(isOutOfCredits(500, "credit")).toBe(false);
	});

	it("starts the next month on the first of the month in UTC", () => {
		expect(new Date(nextMonthStart(Date.UTC(2026, 11, 15))).toISOString()).toBe(
			"2027-01-01T00:00:00.000Z",
		);
	});
});

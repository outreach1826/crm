import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

class FakeWebPushError extends Error {
	constructor(readonly statusCode: number) {
		super(`Push service answered ${statusCode}`);
	}
}

const sent: string[] = [];
const gone = new Set<string>();

mock.module("web-push", () => ({
	WebPushError: FakeWebPushError,
	sendNotification: async (subscription: { endpoint: string }) => {
		if (gone.has(subscription.endpoint)) throw new FakeWebPushError(410);
		sent.push(subscription.endpoint);
		return { statusCode: 201 };
	},
}));

const { db } = await import("@crm/db");
const { isPushServiceEndpoint } = await import("../src/push/push-config");
const { PushService } = await import("../src/push/push.service");

const suffix = process.env.TEST_RUN_ID ?? "push-spec";
const alice = `user-alice-${suffix}`;
const bob = `user-bob-${suffix}`;

const KEYS = {
	VAPID_PUBLIC_KEY: "test-public-key",
	VAPID_PRIVATE_KEY: "test-private-key",
	VAPID_SUBJECT: "mailto:push@example.test",
};

function config(values: Record<string, string | undefined>) {
	return { get: (key: string) => values[key] } as never;
}

function endpoint(name: string) {
	return `https://fcm.googleapis.com/fcm/send/${suffix}-${name}`;
}

function device(name: string) {
	return {
		endpoint: endpoint(name),
		keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
	};
}

const MESSAGE = { title: "T", body: "B", url: "/deals", tag: "t" };

async function clean() {
	await db.user.deleteMany({ where: { id: { in: [alice, bob] } } });
}

beforeAll(async () => {
	await clean();
	for (const [id, name] of [
		[alice, "Alice"],
		[bob, "Bob"],
	] as const) {
		await db.user.create({
			data: { id, name, email: `${id}@example.test`, emailVerified: true },
		});
	}
});

afterAll(clean);

describe("isPushServiceEndpoint", () => {
	it("accepts the browser push services", () => {
		for (const url of [
			"https://fcm.googleapis.com/fcm/send/abc",
			"https://web.push.apple.com/QF2x",
			"https://updates.push.services.mozilla.com/wpush/v2/abc",
			"https://wns2-par02p.notify.windows.com/w/?token=abc",
		]) {
			expect(isPushServiceEndpoint(url)).toBe(true);
		}
	});

	it("refuses anything that could point the server somewhere else", () => {
		for (const url of [
			"http://fcm.googleapis.com/fcm/send/abc",
			"https://fcm.googleapis.com.evil.example/abc",
			"https://evilfcm.googleapis.com.example/abc",
			"https://localhost/abc",
			"https://127.0.0.1/abc",
			"https://169.254.169.254/latest/meta-data",
			"not a url",
		]) {
			expect(isPushServiceEndpoint(url)).toBe(false);
		}
	});
});

describe("PushService without keys", () => {
	it("is off: no public key, and nothing is sent", async () => {
		const push = new PushService(db, config({}));
		await push.subscribe(alice, device("off"));

		expect(push.publicKey()).toBeNull();
		expect(
			await push.deliver({ kind: "users", userIds: [alice] }, MESSAGE),
		).toEqual({ sent: 0, failed: 0, removed: 0 });
	});
});

describe("PushService", () => {
	const push = new PushService(db, config(KEYS));

	it("publishes the public key", () => {
		expect(push.publicKey()).toBe(KEYS.VAPID_PUBLIC_KEY);
	});

	it("moves a device to whoever subscribed it last", async () => {
		await push.subscribe(alice, device("shared"));
		await push.subscribe(bob, device("shared"));

		const row = await db.pushSubscription.findUnique({
			where: { endpoint: endpoint("shared") },
		});
		expect(row?.userId).toBe(bob);
	});

	it("only lets you remove your own device", async () => {
		await push.subscribe(alice, device("alice-phone"));

		expect(await push.unsubscribe(bob, endpoint("alice-phone"))).toBe(0);
		expect(await push.unsubscribe(alice, endpoint("alice-phone"))).toBe(1);
	});

	it("leaves the person who acted out of everyone-except", async () => {
		await push.subscribe(alice, device("alice-laptop"));
		await push.subscribe(bob, device("bob-laptop"));
		sent.length = 0;

		await push.deliver({ kind: "everyone-except", userId: alice }, MESSAGE);

		expect(sent).toContain(endpoint("bob-laptop"));
		expect(sent).not.toContain(endpoint("alice-laptop"));
	});

	it("sends only to the named people", async () => {
		sent.length = 0;

		await push.deliver({ kind: "users", userIds: [alice] }, MESSAGE);

		expect(sent).toContain(endpoint("alice-laptop"));
		expect(sent).not.toContain(endpoint("bob-laptop"));
	});

	it("forgets a device the push service says is gone", async () => {
		await push.subscribe(bob, device("bob-old-phone"));
		gone.add(endpoint("bob-old-phone"));

		const outcome = await push.deliver(
			{ kind: "users", userIds: [bob] },
			MESSAGE,
		);

		expect(outcome.removed).toBe(1);
		expect(
			await db.pushSubscription.findUnique({
				where: { endpoint: endpoint("bob-old-phone") },
			}),
		).toBeNull();
	});
});

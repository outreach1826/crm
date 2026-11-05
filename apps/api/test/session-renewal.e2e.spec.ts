import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

const suffix = process.env.TEST_RUN_ID ?? "session-renewal-spec";
const DOMAIN = `renewal-${suffix}.test`;
const EMAIL = `rae@${DOMAIN}`;
const DAY_MS = 86_400_000;

const previousAllowList = process.env.ALLOWED_SIGN_IN;
process.env.ALLOWED_SIGN_IN = [previousAllowList, DOMAIN]
	.filter(Boolean)
	.join(",");

const { db } = await import("@crm/db");
const { apiUrl } = await import("@crm/auth/env");
const { SESSION_COOKIE_NAME } = await import("@crm/auth/cookies");

function sessionCookieOf(response: request.Response): string | null {
	const header = response.headers["set-cookie"];
	const list = Array.isArray(header) ? header : header ? [header] : [];
	return (
		list.find((cookie) =>
			cookie.split("=")[0]?.endsWith(SESSION_COOKIE_NAME),
		) ?? null
	);
}

describe("keeping a busy user signed in (e2e)", () => {
	let app: INestApplication;
	let server: Parameters<typeof request>[0];
	let sessionCookie = "";

	beforeAll(async () => {
		await db.user.deleteMany({ where: { email: EMAIL } });
		const { createApp } = await import("../src/create-app");
		app = await createApp();
		server = app.getHttpServer();

		const signUp = await request(server)
			.post("/api/auth/sign-up/email")
			.set("origin", apiUrl)
			.send({
				name: "Rae Test",
				email: EMAIL,
				password: "a-long-test-password",
			})
			.expect(200);
		const issued = sessionCookieOf(signUp);
		if (!issued) throw new Error("Sign-up set no session cookie");
		sessionCookie = issued.split(";")[0] ?? "";
	});

	afterAll(async () => {
		await db.user.deleteMany({ where: { email: EMAIL } });
		process.env.ALLOWED_SIGN_IN = previousAllowList;
		await app.close();
	});

	it("still signs in an API key, which carries no session cookie", async () => {
		const created = await request(server)
			.post("/api/auth/api-key/create")
			.set("cookie", sessionCookie)
			.set("origin", apiUrl)
			.send({ name: "renewal test key" })
			.expect(200);
		const key = String(created.body.key);

		await request(server)
			.get("/api/trpc/users.me")
			.set("x-api-key", key)
			.expect(200);
	});

	it("sends the browser a renewed session cookie once the session is a day old", async () => {
		const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS);
		await db.session.updateMany({
			where: { user: { email: EMAIL } },
			data: {
				updatedAt: twoDaysAgo,
				expiresAt: new Date(twoDaysAgo.getTime() + 7 * DAY_MS),
			},
		});

		const response = await request(server)
			.get("/api/trpc/users.me")
			.set("cookie", sessionCookie)
			.expect(200);

		const renewed = sessionCookieOf(response);
		expect(renewed).not.toBeNull();
		expect(renewed).toContain("Max-Age=604800");

		const session = await db.session.findFirstOrThrow({
			where: { user: { email: EMAIL } },
			select: { expiresAt: true },
		});
		expect(session.expiresAt.getTime()).toBeGreaterThan(
			Date.now() + 6 * DAY_MS,
		);
	});
});

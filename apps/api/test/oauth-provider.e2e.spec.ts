import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { z } from "zod";

const suffix = process.env.TEST_RUN_ID ?? "oauth-provider-spec";
const DOMAIN = `oauth-${suffix}.test`;
const EMAIL = `ada@${DOMAIN}`;
const REDIRECT = "https://client.example/callback";

const previousAllowList = process.env.ALLOWED_SIGN_IN;
process.env.ALLOWED_SIGN_IN = [previousAllowList, DOMAIN]
	.filter(Boolean)
	.join(",");

const { db } = await import("@crm/db");
const { apiUrl, appUrl } = await import("@crm/auth/env");
const { OAUTH_PROVIDER } = await import("@crm/auth/oauth-paths");

const registered = z.object({ client_id: z.string() });
const consented = z.object({ redirectURI: z.string() });
const tokens = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	token_type: z.string(),
});
const described = z.object({
	result: z.object({
		data: z.object({ name: z.string(), redirectHosts: z.array(z.string()) }),
	}),
});

function pkce() {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

function locationOf(response: request.Response): URL {
	const location = response.headers.location;
	if (!location) throw new Error(`No redirect, status ${response.status}`);
	return new URL(location, apiUrl);
}

function cookiesOf(response: request.Response): string {
	const header = response.headers["set-cookie"];
	const list = Array.isArray(header) ? header : header ? [header] : [];
	return list.map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("signing an AI app in with OAuth (e2e)", () => {
	let app: INestApplication;
	let server: Parameters<typeof request>[0];
	let cookie = "";
	let clientId = "";

	function authorize(challenge: string, withCookie: boolean) {
		const query = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: REDIRECT,
			scope: "openid offline_access",
			state: "state-1",
			code_challenge: challenge,
			code_challenge_method: "S256",
		});
		const call = request(server).get(
			`/api/auth${OAUTH_PROVIDER.paths.authorize}?${query}`,
		);
		return withCookie ? call.set("cookie", cookie) : call;
	}

	async function consentCode(challenge: string): Promise<string> {
		const response = await authorize(challenge, true);
		const consent = locationOf(response);
		expect(`${consent.origin}${consent.pathname}`).toBe(
			new URL(OAUTH_PROVIDER.pages.consent, appUrl).toString(),
		);
		const code = consent.searchParams.get("consent_code");
		if (!code) throw new Error("No consent code");
		return code;
	}

	async function grant(): Promise<z.infer<typeof tokens>> {
		const { verifier, challenge } = pkce();
		const code = await consentCode(challenge);
		const consent = await request(server)
			.post(`/api/auth${OAUTH_PROVIDER.paths.consent}`)
			.set("cookie", cookie)
			.set("origin", apiUrl)
			.send({ accept: true, consent_code: code })
			.expect(200);
		const back = new URL(consented.parse(consent.body).redirectURI);
		expect(back.searchParams.get("state")).toBe("state-1");

		const exchanged = await request(server)
			.post("/api/auth/mcp/token")
			.type("form")
			.send({
				grant_type: "authorization_code",
				code: back.searchParams.get("code"),
				redirect_uri: REDIRECT,
				client_id: clientId,
				code_verifier: verifier,
			})
			.expect(200);
		return tokens.parse(exchanged.body);
	}

	beforeAll(async () => {
		await db.user.deleteMany({ where: { email: EMAIL } });
		const { createApp } = await import("../src/create-app");
		app = await createApp();
		server = app.getHttpServer();

		const signUp = await request(server)
			.post("/api/auth/sign-up/email")
			.set("origin", apiUrl)
			.send({
				name: "Ada Test",
				email: EMAIL,
				password: "a-long-test-password",
			})
			.expect(200);
		cookie = cookiesOf(signUp);

		const registration = await request(server)
			.post("/api/auth/mcp/register")
			.send({
				client_name: "Test AI",
				redirect_uris: [REDIRECT],
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
			})
			.expect(201);
		clientId = registered.parse(registration.body).client_id;
	});

	afterAll(async () => {
		await db.oauthApplication.deleteMany({ where: { clientId } });
		await db.user.deleteMany({ where: { email: EMAIL } });
		process.env.ALLOWED_SIGN_IN = previousAllowList;
		await app.close();
	});

	it("sends a visitor without a session to the CRM sign-in page", async () => {
		const response = await authorize(pkce().challenge, false);
		const login = locationOf(response);
		expect(`${login.origin}${login.pathname}`).toBe(
			new URL(OAUTH_PROVIDER.pages.login, appUrl).toString(),
		);
		expect(login.searchParams.get("client_id")).toBe(clientId);
	});

	it("asks a signed-in user to allow the app before it gets a code", async () => {
		const response = await authorize(pkce().challenge, true);
		const next = locationOf(response);
		expect(next.host).not.toBe("client.example");
		expect(next.searchParams.get("consent_code")).toBeString();
	});

	it("names the app and where it sends the user on the consent screen", async () => {
		const input = encodeURIComponent(JSON.stringify({ clientId }));
		const response = await request(server)
			.get(`/api/trpc/oauthClients.describe?input=${input}`)
			.set("cookie", cookie)
			.expect(200);
		expect(described.parse(response.body).result.data).toEqual({
			name: "Test AI",
			redirectHosts: ["client.example"],
		});
	});

	it("sends a refusal back to the app as access_denied", async () => {
		const code = await consentCode(pkce().challenge);
		const response = await request(server)
			.post(`/api/auth${OAUTH_PROVIDER.paths.consent}`)
			.set("cookie", cookie)
			.set("origin", apiUrl)
			.send({ accept: false, consent_code: code })
			.expect(200);
		const back = new URL(consented.parse(response.body).redirectURI);
		expect(back.searchParams.get("error")).toBe("access_denied");
		expect(back.searchParams.get("code")).toBeNull();
	});

	it("lets the access token call the REST API as the user", async () => {
		const { access_token } = await grant();
		await request(server)
			.get("/rest/users")
			.set("authorization", `Bearer ${access_token}`)
			.expect(200);
	});

	it("keeps session-only routes closed to an access token", async () => {
		const { access_token } = await grant();
		await request(server)
			.get("/rest/api-keys")
			.set("authorization", `Bearer ${access_token}`)
			.expect(401);
	});

	it("refuses a token it did not issue", async () => {
		await request(server)
			.get("/rest/users")
			.set("authorization", "Bearer not-a-real-token")
			.expect(401);
	});

	it("swaps a refresh token for a working access token", async () => {
		const first = await grant();
		const refreshed = await request(server)
			.post("/api/auth/mcp/token")
			.type("form")
			.send({
				grant_type: "refresh_token",
				refresh_token: first.refresh_token,
				client_id: clientId,
			})
			.expect(200);
		const { access_token } = tokens.parse(refreshed.body);
		expect(access_token).not.toBe(first.access_token);
		await request(server)
			.get("/rest/users")
			.set("authorization", `Bearer ${access_token}`)
			.expect(200);
	});

	it("lists the app as connected and disconnects it", async () => {
		const { access_token } = await grant();
		const listed = await request(server)
			.get("/api/trpc/oauthClients.connected")
			.set("cookie", cookie)
			.expect(200);
		expect(JSON.stringify(listed.body)).toContain(clientId);

		await request(server)
			.post("/api/trpc/oauthClients.disconnect")
			.set("cookie", cookie)
			.set("origin", apiUrl)
			.send({ clientId })
			.expect(200);
		await request(server)
			.get("/rest/users")
			.set("authorization", `Bearer ${access_token}`)
			.expect(401);
	});
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");

describe("the OpenAPI document (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { createApp } = await import("../src/create-app");
		app = await createApp();
	});

	afterAll(async () => {
		await app.close();
	});

	it("lists every tRPC procedure at the REST bridge path it is served at", async () => {
		const { body } = await request(app.getHttpServer())
			.get("/openapi.json")
			.expect(200);

		expect(body.paths["/rest/deals/search"]).toBeDefined();
		expect(body.paths["/deals/search"]).toBeUndefined();
		expect(body.paths["/health"]).toBeDefined();
	});

	it("names the server the paths are relative to", async () => {
		const { body } = await request(app.getHttpServer())
			.get("/openapi.json")
			.expect(200);

		expect(body.servers?.[0]?.url).toBeString();
	});

	it("serves a documented bridge path, refusing it without a key", async () => {
		await request(app.getHttpServer())
			.post("/rest/deals/search")
			.send({})
			.expect(401);
	});
});

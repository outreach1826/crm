import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

const actual = await import("../src/safe-fetch");

mock.module("../src/safe-fetch", () => ({
	...actual,
	safeFetch: async () => ({
		response: new Response(PNG, { headers: { "content-type": "image/png" } }),
	}),
}));

const { blobEnabled, isMirrored, mirror } = await import("../src/blob");

const MEDIA_URL = "https://crm.example/media";
let dir = "";
const previous = {
	dir: process.env.MEDIA_DIR,
	url: process.env.MEDIA_URL,
	token: process.env.BLOB_READ_WRITE_TOKEN,
};

describe("storing pictures on the server's own disk", () => {
	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "crm-media-"));
		process.env.MEDIA_DIR = dir;
		process.env.MEDIA_URL = `${MEDIA_URL}/`;
		delete process.env.BLOB_READ_WRITE_TOKEN;
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
		process.env.MEDIA_DIR = previous.dir;
		process.env.MEDIA_URL = previous.url;
		process.env.BLOB_READ_WRITE_TOKEN = previous.token;
	});

	it("counts as storage when a directory and a public address are set", () => {
		expect(blobEnabled()).toBe(true);
	});

	it("writes the bytes under the directory and hands back our address", async () => {
		const url = await mirror(
			"https://media.licdn.com/photo.png",
			"contacts/c1",
		);
		expect(url).toStartWith(`${MEDIA_URL}/contacts/c1-`);
		expect(url).toEndWith(".png");

		const name = url?.slice(MEDIA_URL.length + 1) ?? "";
		const path = join(dir, name);
		expect(existsSync(path)).toBe(true);
		expect(readFileSync(path).equals(PNG)).toBe(true);
	});

	it("knows a stored address is already ours", async () => {
		const url = await mirror(
			"https://media.licdn.com/photo.png",
			"contacts/c2",
		);
		expect(isMirrored(url)).toBe(true);
		expect(await mirror(url ?? "", "contacts/c2")).toBe(url);
		expect(isMirrored("https://media.licdn.com/photo.png")).toBe(false);
	});

	it("refuses a name that would land outside the directory", async () => {
		expect(await mirror("https://example.com/a.png", "../escape")).toBeNull();
	});
});

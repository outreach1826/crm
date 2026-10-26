import { describe, expect, it } from "bun:test";
import { base64UrlToBytes } from "../lib/push";

describe("base64UrlToBytes", () => {
	it("decodes URL-safe base64 without padding", () => {
		expect([...base64UrlToBytes("-_8")]).toEqual([0xfb, 0xff]);
	});

	it("matches the standard decoder on a full-length key", () => {
		const bytes = Uint8Array.from({ length: 65 }, (_, index) => index * 3);
		const urlSafe = Buffer.from(bytes)
			.toString("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");

		expect([...base64UrlToBytes(urlSafe)]).toEqual([...bytes]);
	});
});

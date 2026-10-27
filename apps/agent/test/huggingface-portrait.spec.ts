import { describe, expect, it } from "bun:test";
import {
	huggingfaceUser,
	uploadedHuggingfacePhoto,
} from "../agent/lib/portrait-sources";

describe("a Hugging Face profile as a photo source", () => {
	it("reads the user from a profile link", () => {
		expect(huggingfaceUser("https://huggingface.co/Man-tas")).toBe("Man-tas");
		expect(huggingfaceUser("https://www.huggingface.co/Man-tas/")).toBe(
			"Man-tas",
		);
	});

	it("refuses links that are not one profile", () => {
		expect(huggingfaceUser("https://huggingface.co/Man-tas/model")).toBeNull();
		expect(huggingfaceUser("https://example.com/Man-tas")).toBeNull();
		expect(huggingfaceUser("not a link")).toBeNull();
		expect(huggingfaceUser(null)).toBeNull();
	});

	it("takes an uploaded picture from Hugging Face's own image host", () => {
		const url =
			"https://cdn-avatars.huggingface.co/v1/production/uploads/abc/photo.jpeg";
		expect(uploadedHuggingfacePhoto(url)).toBe(url);
	});

	it("ignores the generated placeholder and pictures from anywhere else", () => {
		expect(
			uploadedHuggingfacePhoto("/avatars/79844688a13a475384474f8cebbfb4aa.svg"),
		).toBeNull();
		expect(
			uploadedHuggingfacePhoto("https://cdn-avatars.huggingface.co/a/b.svg"),
		).toBeNull();
		expect(uploadedHuggingfacePhoto("https://evil.example/a.jpg")).toBeNull();
		expect(uploadedHuggingfacePhoto(null)).toBeNull();
	});
});

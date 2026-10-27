import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { isMirrored as isOnVercelBlob } from "./images";
import { safeFetch } from "./safe-fetch";

export { isOptimizable } from "./images";

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

type ExtensionByMediaType = Record<string, string>;

const ALLOWED: ExtensionByMediaType = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/avif": "avif",
	"image/svg+xml": "svg",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

type LocalMedia = { dir: string; url: string };

function localMedia(): LocalMedia | null {
	const dir = process.env.MEDIA_DIR?.trim();
	const url = process.env.MEDIA_URL?.trim().replace(/\/+$/, "");
	return dir && url ? { dir: resolve(dir), url } : null;
}

function vercelBlobEnabled(): boolean {
	return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function blobEnabled(): boolean {
	return vercelBlobEnabled() || localMedia() !== null;
}

export function isMirrored(url: string | null | undefined): boolean {
	if (!url) return false;
	const local = localMedia();
	return (
		isOnVercelBlob(url) || (local !== null && url.startsWith(`${local.url}/`))
	);
}

async function storeLocally(
	media: LocalMedia,
	name: string,
	bytes: Buffer,
): Promise<string | null> {
	const path = resolve(join(media.dir, name));
	if (!path.startsWith(media.dir + sep)) return null;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
	return `${media.url}/${name}`;
}

export async function mirror(
	sourceUrl: string,
	prefix: string,
): Promise<string | null> {
	if (!blobEnabled()) return null;
	if (isMirrored(sourceUrl)) return sourceUrl;

	try {
		const result = await safeFetch(sourceUrl, { timeoutMs: TIMEOUT_MS });
		if (!result?.response.ok) return null;

		const { response } = result;
		const type = response.headers.get("content-type")?.split(";")[0]?.trim();
		const extension = type ? ALLOWED[type.toLowerCase()] : undefined;
		if (!type || !extension) return null;

		const bytes = await readCapped(response);
		if (!bytes) return null;

		const digest = createHash("sha256")
			.update(bytes)
			.digest("hex")
			.slice(0, 12);

		const name = `${prefix}-${digest}.${extension}`;

		const local = vercelBlobEnabled() ? null : localMedia();
		if (local) return await storeLocally(local, name, bytes);

		const { put } = await import("@vercel/blob");

		const blob = await put(name, bytes, {
			access: "public",
			contentType: type,
			addRandomSuffix: false,
			allowOverwrite: true,
		});

		return blob.url;
	} catch {
		return null;
	}
}

async function readCapped(response: Response): Promise<Buffer | null> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_BYTES) {
		await response.body?.cancel();
		return null;
	}

	if (!response.body) return null;

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	try {
		while (size <= MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			chunks.push(value);
		}
	} catch {
		return null;
	} finally {
		await reader.cancel().catch(() => {});
	}

	if (size === 0 || size > MAX_BYTES) return null;
	return Buffer.concat(chunks);
}

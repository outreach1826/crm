export const SERVICE_WORKER = { url: "/sw.js", scope: "/" } as const;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
	return navigator.serviceWorker.register(SERVICE_WORKER.url, {
		scope: SERVICE_WORKER.scope,
		updateViaCache: "none",
	});
}

export async function activeRegistration(): Promise<ServiceWorkerRegistration> {
	const existing = await navigator.serviceWorker.getRegistration(
		SERVICE_WORKER.scope,
	);
	if (!existing) await registerServiceWorker();
	return navigator.serviceWorker.ready;
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const raw = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let index = 0; index < raw.length; index += 1) {
		bytes[index] = raw.charCodeAt(index);
	}
	return bytes;
}

export type DeviceSupport = "supported" | "needs-install" | "unsupported";

function isAppleMobile(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
	);
}

function isInstalledApp(): boolean {
	return window.matchMedia("(display-mode: standalone)").matches;
}

export function deviceSupport(): DeviceSupport {
	const supported =
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window;
	if (supported) return "supported";
	return isAppleMobile() && !isInstalledApp() ? "needs-install" : "unsupported";
}

export type DeviceKeys = { endpoint: string; p256dh: string; auth: string };

export function deviceKeys(subscription: PushSubscription): DeviceKeys {
	const { keys } = subscription.toJSON();
	const p256dh = keys?.p256dh;
	const auth = keys?.auth;
	if (!p256dh || !auth) {
		throw new Error("This browser did not hand over the keys push needs.");
	}
	return { endpoint: subscription.endpoint, p256dh, auth };
}

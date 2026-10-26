const FALLBACK = {
	title: "7crawl CRM",
	body: "",
	url: "/",
	tag: undefined,
};

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

function readMessage(event) {
	if (!event.data) return FALLBACK;
	try {
		const data = event.data.json();
		return {
			title: typeof data.title === "string" ? data.title : FALLBACK.title,
			body: typeof data.body === "string" ? data.body : FALLBACK.body,
			url: typeof data.url === "string" ? data.url : FALLBACK.url,
			tag: typeof data.tag === "string" ? data.tag : FALLBACK.tag,
		};
	} catch {
		return { ...FALLBACK, body: event.data.text() };
	}
}

function sameOriginUrl(path) {
	const url = new URL(path, self.location.origin);
	return url.origin === self.location.origin ? url.href : self.location.origin;
}

self.addEventListener("push", (event) => {
	const message = readMessage(event);
	event.waitUntil(
		self.registration.showNotification(message.title, {
			body: message.body,
			tag: message.tag,
			icon: "/web-app-manifest-192x192.png",
			badge: "/favicon-96x96.png",
			data: { url: message.url },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = sameOriginUrl(event.notification.data?.url ?? "/");

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			const open = windows.find((client) => "focus" in client);
			if (open) {
				await open.navigate(target).catch(() => undefined);
				return open.focus();
			}
			return self.clients.openWindow(target);
		})(),
	);
});

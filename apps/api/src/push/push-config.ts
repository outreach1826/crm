const HOUR_SECONDS = 60 * 60;

export const PUSH = {
	delivery: {
		ttlSeconds: 24 * HOUR_SECONDS,
		urgency: "normal",
	},
	endpointHosts: [
		"fcm.googleapis.com",
		"push.apple.com",
		"push.services.mozilla.com",
		"notify.windows.com",
	],
	limits: {
		endpointLength: 2048,
		keyLength: 512,
		userAgentLength: 512,
	},
	goneStatusCodes: [404, 410],
} as const;

export function isPushServiceEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}

	if (url.protocol !== "https:") return false;

	return PUSH.endpointHosts.some(
		(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
	);
}

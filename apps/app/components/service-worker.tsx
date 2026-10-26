"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { registerServiceWorker } from "@/lib/push";

export function ServiceWorker() {
	useMountEffect(() => {
		if (!("serviceWorker" in navigator)) return;

		let registration: ServiceWorkerRegistration | null = null;
		void registerServiceWorker()
			.then((registered) => {
				registration = registered;
			})
			.catch(() => undefined);

		const checkForUpdate = () => {
			if (document.visibilityState !== "visible") return;
			void registration?.update().catch(() => undefined);
		};

		document.addEventListener("visibilitychange", checkForUpdate);
		return () =>
			document.removeEventListener("visibilitychange", checkForUpdate);
	});

	return null;
}

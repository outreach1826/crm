"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	activeRegistration,
	base64UrlToBytes,
	deviceKeys,
	deviceSupport,
} from "@/lib/push";
import { useTRPC } from "@/lib/trpc/client";

type DeviceState =
	| { kind: "checking" }
	| { kind: "needs-install" }
	| { kind: "unsupported" }
	| { kind: "blocked" }
	| { kind: "off" }
	| { kind: "on"; endpoint: string };

const STATUS = {
	checking: { tone: "neutral", label: "Checking this device" },
	"needs-install": { tone: "warning", label: "Install the app first" },
	unsupported: { tone: "neutral", label: "Not available here" },
	blocked: { tone: "error", label: "Blocked in this browser" },
	off: { tone: "neutral", label: "Off on this device" },
	on: { tone: "success", label: "On for this device" },
} satisfies Record<DeviceState["kind"], { tone: StatusTone; label: string }>;

async function readDeviceState(): Promise<DeviceState> {
	const support = deviceSupport();
	if (support === "needs-install") return { kind: "needs-install" };
	if (support === "unsupported") return { kind: "unsupported" };
	if (Notification.permission === "denied") return { kind: "blocked" };

	const registration = await activeRegistration();
	const subscription = await registration.pushManager.getSubscription();
	return subscription
		? { kind: "on", endpoint: subscription.endpoint }
		: { kind: "off" };
}

export function Notifications() {
	const trpc = useTRPC();
	const config = useQuery(trpc.push.config.queryOptions());
	const [device, setDevice] = useState<DeviceState>({ kind: "checking" });
	const [busy, setBusy] = useState(false);

	const subscribe = useMutation(trpc.push.subscribe.mutationOptions());
	const unsubscribe = useMutation(trpc.push.unsubscribe.mutationOptions());
	const sendTest = useMutation(
		trpc.push.test.mutationOptions({
			onSuccess: ({ sent }) =>
				sent > 0
					? toast.success(
							sent === 1
								? "Test sent. It should appear in a moment."
								: `Test sent to ${sent} of your devices.`,
						)
					: toast.error("No device got it. Turn notifications on first."),
			onError: (error) => toast.error(error.message),
		}),
	);

	useMountEffect(() => {
		void readDeviceState()
			.then(setDevice)
			.catch(() => setDevice({ kind: "unsupported" }));
	});

	const publicKey = config.data?.publicKey ?? null;
	const serverReady = config.isSuccess && publicKey !== null;

	async function turnOn() {
		if (!publicKey) return;
		setBusy(true);
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setDevice(
					permission === "denied" ? { kind: "blocked" } : { kind: "off" },
				);
				return;
			}

			const registration = await activeRegistration();
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: base64UrlToBytes(publicKey),
			});
			const keys = deviceKeys(subscription);

			await subscribe.mutateAsync({
				endpoint: keys.endpoint,
				keys: { p256dh: keys.p256dh, auth: keys.auth },
				userAgent: navigator.userAgent.slice(0, 512),
			});

			setDevice({ kind: "on", endpoint: keys.endpoint });
			toast.success("Notifications are on for this device.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not turn notifications on.",
			);
		} finally {
			setBusy(false);
		}
	}

	async function turnOff() {
		setBusy(true);
		try {
			const registration = await activeRegistration();
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await unsubscribe.mutateAsync({ endpoint: subscription.endpoint });
				await subscription.unsubscribe();
			}
			setDevice({ kind: "off" });
			toast.success("Notifications are off for this device.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not turn notifications off.",
			);
		} finally {
			setBusy(false);
		}
	}

	const status = STATUS[device.kind];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<CardDescription>
					Get a notification on this device when a deal is created, moves stage,
					or is assigned to you. It keeps arriving after you sign out, so turn
					it off here before you hand the device to someone else.
				</CardDescription>

				<CardAction>
					{device.kind === "on" ? (
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								disabled={sendTest.isPending}
								onClick={() => sendTest.mutate()}
							>
								{sendTest.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Send a test
							</Button>
							<Button
								variant="ghost"
								disabled={busy}
								onClick={() => void turnOff()}
							>
								Turn off
							</Button>
						</div>
					) : (
						<Button
							disabled={busy || !serverReady || device.kind !== "off"}
							onClick={() => void turnOn()}
						>
							{busy ? <Spinner data-icon="inline-start" /> : null}
							Turn on
						</Button>
					)}
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
				<StatusIndicator size="sm" tone={status.tone} label={status.label} />

				{config.isSuccess && !publicKey ? (
					<p>
						Notifications are not set up on the server yet, so nothing can be
						sent.
					</p>
				) : null}
				{device.kind === "needs-install" ? (
					<p>
						On iPhone and iPad, notifications only work in the installed app.
						Tap Share, then Add to Home Screen, open the CRM from your Home
						Screen, and come back here.
					</p>
				) : null}
				{device.kind === "blocked" ? (
					<p>
						This browser is set to block notifications from the CRM. Allow them
						in the site settings next to the address bar, then reload this page.
					</p>
				) : null}
				{device.kind === "unsupported" ? (
					<p>This browser cannot receive notifications.</p>
				) : null}

				<p>
					Install the CRM as an app: in Chrome or Edge, use the install button
					in the address bar. On iPhone or iPad, tap Share, then Add to Home
					Screen. The installed app updates itself whenever the CRM changes.
				</p>
			</CardContent>
		</Card>
	);
}

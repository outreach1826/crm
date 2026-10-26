import { z } from "zod";
import { isPushServiceEndpoint, PUSH } from "./push-config";

const endpoint = z
	.string()
	.max(PUSH.limits.endpointLength)
	.refine(isPushServiceEndpoint, {
		message: "That is not a browser push service address.",
	});

export const pushSubscribeInput = z.object({
	endpoint,
	keys: z.object({
		p256dh: z.string().min(1).max(PUSH.limits.keyLength),
		auth: z.string().min(1).max(PUSH.limits.keyLength),
	}),
	userAgent: z.string().max(PUSH.limits.userAgentLength).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeInput>;

export const pushEndpointInput = z.object({ endpoint });

export const pushConfigOutput = z.object({
	publicKey: z.string().nullable(),
});

export const pushSavedOutput = z.object({ saved: z.literal(true) });

export const pushRemovedOutput = z.object({ removed: z.number() });

export const pushDeliveryOutput = z.object({
	sent: z.number(),
	failed: z.number(),
	removed: z.number(),
});

export type PushDelivery = z.infer<typeof pushDeliveryOutput>;

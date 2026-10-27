import { z } from "zod";

export const describeOAuthClientInput = z.object({
	clientId: z.string().trim().min(1).max(200),
});

export const describeOAuthClientOutput = z
	.object({
		clientId: z.string(),
		name: z.string().nullable(),
		redirectHosts: z.array(z.string()),
	})
	.nullable();

export const connectedOAuthClientsOutput = z.array(
	z.object({
		clientId: z.string(),
		name: z.string().nullable(),
		redirectHosts: z.array(z.string()),
		connectedAt: z.string(),
		lastTokenAt: z.string(),
	}),
);

export const disconnectOAuthClientInput = z.object({
	clientId: z.string().trim().min(1).max(200),
});

export const disconnectOAuthClientOutput = z.object({
	disconnected: z.boolean(),
});

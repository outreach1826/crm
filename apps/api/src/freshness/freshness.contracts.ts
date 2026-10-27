import { z } from "zod";

export const freshnessStampOutput = z.object({
	stamp: z.string(),
});

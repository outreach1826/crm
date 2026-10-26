import type { DealNotifications } from "../src/push/deal-notifications.service";

export const silentDealNotifications = {
	created: async () => undefined,
	stageChanged: async () => undefined,
	assigned: async () => undefined,
	bulkAssigned: async () => undefined,
} as unknown as DealNotifications;

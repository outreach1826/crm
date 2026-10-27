import { DIRECT_KINDS, isDirectKind } from "@crm/db/agent-tasks";

export type KindFilter =
	| { only: readonly string[] }
	| { except: readonly string[] };

export function allowedTaskKinds(
	value: string | undefined = process.env.AGENT_TASK_KINDS,
): readonly string[] | null {
	const kinds = (value ?? "")
		.split(",")
		.map((kind) => kind.trim())
		.filter(Boolean);
	return kinds.length > 0 ? kinds : null;
}

export function visibleKinds(allowed: readonly string[] | null): KindFilter {
	return allowed
		? { only: DIRECT_KINDS.filter((kind) => allowed.includes(kind)) }
		: { only: DIRECT_KINDS };
}

export function researchKinds(allowed: readonly string[] | null): KindFilter {
	return allowed
		? { only: allowed.filter((kind) => !isDirectKind(kind)) }
		: { except: DIRECT_KINDS };
}

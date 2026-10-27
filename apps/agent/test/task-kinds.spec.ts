import { describe, expect, it } from "bun:test";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import {
	allowedTaskKinds,
	researchKinds,
	visibleKinds,
} from "../agent/lib/task-kinds";

describe("limiting the agent to some kinds of work", () => {
	it("runs everything when AGENT_TASK_KINDS is unset or blank", () => {
		expect(allowedTaskKinds(undefined)).toBeNull();
		expect(allowedTaskKinds(" , ")).toBeNull();
		expect(visibleKinds(null)).toEqual({ only: DIRECT_KINDS });
		expect(researchKinds(null)).toEqual({ except: DIRECT_KINDS });
	});

	it("runs only portraits when that is the whole list", () => {
		const allowed = allowedTaskKinds("portrait");
		expect(visibleKinds(allowed)).toEqual({ only: ["portrait"] });
		expect(researchKinds(allowed)).toEqual({ only: [] });
	});

	it("splits a mixed list between the two lanes", () => {
		const allowed = allowedTaskKinds(" portrait , identify ");
		expect(visibleKinds(allowed)).toEqual({ only: ["portrait"] });
		expect(researchKinds(allowed)).toEqual({ only: ["identify"] });
	});
});

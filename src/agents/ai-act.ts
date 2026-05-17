import { writeAudit } from "../lib/audit";
import type { AgentContext } from "./intake";

export async function runAiAct(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	// TODO: classify AI tool by EU AI Act risk tier, generate documentation

	await writeAudit({
		agentName: "ai-act",
		action: "ai_act_invoked",
		supplierId: context.supplierId,
		payload: params,
	});

	return { status: "pending" };
}

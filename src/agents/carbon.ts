import { writeAudit } from "../lib/audit";
import type { AgentContext } from "./intake";

export async function runCarbon(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	// TODO: ingest energy bills via Gemini Flash multimodal, calculate Scope 1 & 2

	await writeAudit({
		agentName: "carbon",
		action: "carbon_invoked",
		supplierId: context.supplierId,
		payload: params,
	});

	return { status: "pending" };
}

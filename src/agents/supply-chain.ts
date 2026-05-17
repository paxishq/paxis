import { writeAudit } from "../lib/audit";
import type { AgentContext } from "./intake";

export async function runSupplyChain(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	// TODO: aggregate supplier Scope 3 responses, update scope3_aggregates

	await writeAudit({
		agentName: "supply-chain",
		action: "supply_chain_invoked",
		enterpriseId: context.enterpriseId,
		supplierId: context.supplierId,
		payload: params,
	});

	return { status: "pending" };
}

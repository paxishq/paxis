import { writeAudit } from "../lib/audit";

export interface AgentContext {
	enterpriseId?: string;
	supplierId?: string;
}

export async function runIntake(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	// TODO: parse questionnaire, map questions to existing supplier data, identify gaps

	await writeAudit({
		agentName: "intake",
		action: "intake_invoked",
		enterpriseId: context.enterpriseId,
		supplierId: context.supplierId,
		payload: params,
	});

	return { status: "pending" };
}

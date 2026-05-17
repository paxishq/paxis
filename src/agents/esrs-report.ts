import { writeAudit } from "../lib/audit";
import type { AgentContext } from "./intake";

export async function runEsrsReport(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	// TODO: assemble CSRD-standard ESRS output, generate audit-ready report

	await writeAudit({
		agentName: "esrs-report",
		action: "esrs_report_invoked",
		enterpriseId: context.enterpriseId,
		payload: params,
	});

	return { status: "pending" };
}

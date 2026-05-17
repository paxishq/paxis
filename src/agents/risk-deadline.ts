import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { generate } from "../lib/llm";
import { writeAudit } from "../lib/audit";
import { enterprises, questionnaires, scope3Aggregates } from "../db/schema";
import type { AgentContext } from "./intake";

const RiskAssessmentSchema = z.object({
	overallRisk: z.enum(["critical", "high", "medium", "low"]),
	summary: z.string(),
	flags: z.array(
		z.object({
			type: z.enum(["deadline", "data_gap", "threshold_breach", "compliance"]),
			severity: z.enum(["critical", "high", "medium", "low"]),
			description: z.string(),
			recommendation: z.string(),
		}),
	),
	estimatedFilingReadiness: z.number().min(0).max(100),
});

const SYSTEM_PROMPT = `You are a CSRD/EU AI Act compliance risk assessor. Given an enterprise's compliance data snapshot, assess filing readiness and surface actionable risks.

Key EU compliance deadlines:
- CSRD first wave (FY2024 data): Large public-interest entities → first CSRD report due mid-2025
- CSRD second wave (FY2025 data): Large enterprises (>500 employees or >€50M revenue) → first report due mid-2026
- CSRD third wave (FY2026 data): Listed SMEs → first report due mid-2027
- EU AI Act: GPAI model obligations → August 2025; high-risk system obligations → August 2026

Return ONLY valid JSON:
{
  "overallRisk": "critical" | "high" | "medium" | "low",
  "summary": "<one sentence overall assessment>",
  "flags": [
    {
      "type": "deadline" | "data_gap" | "threshold_breach" | "compliance",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "<what the risk is>",
      "recommendation": "<specific action to take>"
    }
  ],
  "estimatedFilingReadiness": <integer 0-100 representing % of CSRD requirements met>
}`;

function extractJson(text: string): string {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return match?.[1]?.trim() ?? text.trim();
}

export async function runRiskDeadline(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	const enterpriseId = context.enterpriseId;

	if (!enterpriseId) {
		await writeAudit({
			agentName: "risk-deadline",
			action: "risk_deadline_skipped",
			payload: { reason: "missing enterpriseId", params },
		});
		return { status: "skipped", reason: "missing enterpriseId" };
	}

	const [enterprise] = await db
		.select()
		.from(enterprises)
		.where(eq(enterprises.id, enterpriseId));

	if (!enterprise) {
		await writeAudit({
			agentName: "risk-deadline",
			action: "risk_deadline_skipped",
			enterpriseId,
			payload: { reason: "enterprise not found" },
		});
		return { status: "skipped", reason: "enterprise not found" };
	}

	const allQuestionnaires = await db
		.select()
		.from(questionnaires)
		.where(eq(questionnaires.enterpriseId, enterpriseId));

	const [scope3] = await db
		.select()
		.from(scope3Aggregates)
		.where(
			and(
				eq(scope3Aggregates.enterpriseId, enterpriseId),
				eq(scope3Aggregates.reportingYear, enterprise.reportingYear),
			),
		);

	const statusCounts = allQuestionnaires.reduce(
		(acc, q) => {
			acc[q.status] = (acc[q.status] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	const overdueDetails = allQuestionnaires
		.filter((q) => q.status === "overdue")
		.map((q) => ({ title: q.title, dueAt: q.dueAt }));

	const snapshot = `Enterprise: "${enterprise.name}" (${enterprise.country})
Reporting year: ${enterprise.reportingYear}
Current date: ${new Date().toISOString().split("T")[0]}

Questionnaire status breakdown:
${JSON.stringify(statusCounts, null, 2)}

Overdue questionnaires (${overdueDetails.length}):
${overdueDetails.length > 0 ? JSON.stringify(overdueDetails, null, 2) : "None"}

Scope 3 data:
${
	scope3
		? `${scope3.co2Tonnes.toFixed(2)} tCO₂e from ${scope3.supplierCount} suppliers
Completion rate: ${Math.round(scope3.completionRate * 100)}%
Last calculated: ${scope3.calculatedAt.toISOString().split("T")[0]}`
		: "No Scope 3 data aggregated yet"
}

Summary:
- Total questionnaires dispatched: ${allQuestionnaires.filter((q) => q.status !== "draft").length}
- Completed: ${statusCounts.completed ?? 0}
- In progress: ${statusCounts.in_progress ?? 0}
- Awaiting response: ${statusCounts.sent ?? 0}
- Overdue: ${statusCounts.overdue ?? 0}`;

	let assessment: z.infer<typeof RiskAssessmentSchema>;

	try {
		const raw = await generate([{ role: "user", content: snapshot }], {
			model: "flash",
			system: SYSTEM_PROMPT,
			temperature: 0.2,
		});

		const parsed = RiskAssessmentSchema.safeParse(JSON.parse(extractJson(raw)));
		if (!parsed.success) {
			throw new Error(`Risk agent returned invalid assessment: ${parsed.error.message}`);
		}
		assessment = parsed.data;
	} catch (err) {
		await writeAudit({
			agentName: "risk-deadline",
			action: "risk_deadline_failed",
			enterpriseId,
			payload: { error: err instanceof Error ? err.message : String(err) },
		});
		return { status: "error", error: err instanceof Error ? err.message : String(err) };
	}

	await writeAudit({
		agentName: "risk-deadline",
		action: "risk_deadline_assessed",
		enterpriseId,
		payload: {
			overallRisk: assessment.overallRisk,
			summary: assessment.summary,
			flagCount: assessment.flags.length,
			estimatedFilingReadiness: assessment.estimatedFilingReadiness,
			flags: assessment.flags,
		},
	});

	return {
		status: "ok",
		overallRisk: assessment.overallRisk,
		summary: assessment.summary,
		flagCount: assessment.flags.length,
		estimatedFilingReadiness: assessment.estimatedFilingReadiness,
		flags: assessment.flags,
	};
}

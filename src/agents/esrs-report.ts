import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { generate } from "../lib/llm";
import { writeAudit } from "../lib/audit";
import {
	auditLog,
	enterprises,
	questionnaireResponses,
	questionnaires,
	scope3Aggregates,
} from "../db/schema";
import type { AgentContext } from "./intake";

const EsrsReportSchema = z.object({
	title: z.string(),
	reportingPeriod: z.string(),
	executiveSummary: z.string(),
	esrs2General: z.object({
		governanceOverview: z.string(),
		strategyAndBusinessModel: z.string(),
		materialTopics: z.array(z.string()),
	}),
	esrs1Climate: z.object({
		scope1tCO2e: z.number().nullable(),
		scope2tCO2e: z.number().nullable(),
		scope3tCO2e: z.number().nullable(),
		totalGHG: z.number().nullable(),
		dataQuality: z.enum(["high", "medium", "low"]),
		gapsAndLimitations: z.string(),
	}),
	supplierDataQuality: z.object({
		totalSuppliersContacted: z.number(),
		responsesReceived: z.number(),
		completionRatePercent: z.number(),
	}),
	recommendedActions: z.array(z.string()),
	assuranceReadiness: z.enum(["ready", "partial", "not_ready"]),
});

const SCHEMA_DEFINITION = `{
  "title": "<CSRD report title>",
  "reportingPeriod": "<e.g. FY2025>",
  "executiveSummary": "<2-3 sentence summary of the enterprise's sustainability performance>",
  "esrs2General": {
    "governanceOverview": "<governance and oversight description>",
    "strategyAndBusinessModel": "<how sustainability is embedded in strategy>",
    "materialTopics": ["<material sustainability topic 1>", "<material sustainability topic 2>"]
  },
  "esrs1Climate": {
    "scope1tCO2e": <number or null — direct combustion emissions>,
    "scope2tCO2e": <number or null — purchased energy emissions>,
    "scope3tCO2e": <number or null — supply chain emissions>,
    "totalGHG": <sum of all scopes or null if none available>,
    "dataQuality": "high" | "medium" | "low",
    "gapsAndLimitations": "<description of missing data and why>"
  },
  "supplierDataQuality": {
    "totalSuppliersContacted": <integer>,
    "responsesReceived": <integer>,
    "completionRatePercent": <0-100 integer>
  },
  "recommendedActions": ["<highest priority action>", "<second action>", "<third action>"],
  "assuranceReadiness": "ready" | "partial" | "not_ready"
}`;

const SYSTEM_PROMPT = `You are an ESRS (European Sustainability Reporting Standards) report generator for CSRD compliance.
Given enterprise compliance data, generate a structured CSRD-compliant annual report summary.

ESRS standards addressed:
- ESRS 2: General disclosures (governance, strategy, materiality assessment)
- ESRS E1: Climate change (GHG emissions, Scopes 1, 2, 3, climate targets)

Be precise with numbers; use null for genuinely missing data. Do not estimate figures.
Return ONLY valid JSON matching the schema exactly.`;

function extractJson(text: string): string {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return match?.[1]?.trim() ?? text.trim();
}

export async function runEsrsReport(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	const enterpriseId = context.enterpriseId;

	if (!enterpriseId) {
		await writeAudit({
			agentName: "esrs-report",
			action: "esrs_report_skipped",
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
			agentName: "esrs-report",
			action: "esrs_report_skipped",
			enterpriseId,
			payload: { reason: "enterprise not found" },
		});
		return { status: "skipped", reason: "enterprise not found" };
	}

	const [allQuestionnaires, scope3Results, recentAudit] = await Promise.all([
		db.select().from(questionnaires).where(eq(questionnaires.enterpriseId, enterpriseId)),
		db
			.select()
			.from(scope3Aggregates)
			.where(
				and(
					eq(scope3Aggregates.enterpriseId, enterpriseId),
					eq(scope3Aggregates.reportingYear, enterprise.reportingYear),
				),
			),
		db
			.select()
			.from(auditLog)
			.where(eq(auditLog.enterpriseId, enterpriseId))
			.orderBy(desc(auditLog.createdAt))
			.limit(20),
	]);

	const completedQuestionnaires = allQuestionnaires.filter((q) => q.status === "completed");
	const sentQuestionnaires = allQuestionnaires.filter((q) => q.status !== "draft");
	const scope3 = scope3Results[0];

	const completedResponses = await Promise.all(
		completedQuestionnaires.slice(0, 5).map(async (q) => {
			const [response] = await db
				.select()
				.from(questionnaireResponses)
				.where(eq(questionnaireResponses.questionnaireId, q.id));
			return { title: q.title, answerCount: Object.keys((response?.answers ?? {}) as object).length };
		}),
	);

	const dataPackage = `Enterprise: "${enterprise.name}"
Country: ${enterprise.country}
VAT: ${enterprise.vatNumber ?? "N/A"}
Reporting year: ${enterprise.reportingYear}
Report generated: ${new Date().toISOString().split("T")[0]}

Scope 3 emissions (supply chain):
${
	scope3
		? `${scope3.co2Tonnes.toFixed(2)} tCO₂e from ${scope3.supplierCount} supplier(s)
Completion rate: ${Math.round(scope3.completionRate * 100)}%
Last calculated: ${scope3.calculatedAt.toISOString().split("T")[0]}`
		: "No Scope 3 data available yet"
}

Supplier questionnaire status:
- Total dispatched: ${sentQuestionnaires.length}
- Completed: ${completedQuestionnaires.length}
- In progress: ${allQuestionnaires.filter((q) => q.status === "in_progress").length}
- Awaiting response: ${allQuestionnaires.filter((q) => q.status === "sent").length}
- Overdue: ${allQuestionnaires.filter((q) => q.status === "overdue").length}

Sample completed responses:
${completedResponses.map((r) => `- ${r.title}: ${r.answerCount} answers`).join("\n") || "None"}

Recent agent activity:
${recentAudit.map((e) => `${e.agentName}:${e.action}`).join(", ") || "None"}`;

	let report: z.infer<typeof EsrsReportSchema>;

	try {
		const raw = await generate(
			[
				{
					role: "user",
					content: `${dataPackage}\n\nGenerate the CSRD ESRS report using this JSON schema:\n${SCHEMA_DEFINITION}`,
				},
			],
			{
				model: "pro",
				system: SYSTEM_PROMPT,
				temperature: 0.2,
			},
		);

		const parsed = EsrsReportSchema.safeParse(JSON.parse(extractJson(raw)));
		if (!parsed.success) {
			throw new Error(`ESRS report LLM returned invalid structure: ${parsed.error.message}`);
		}
		report = parsed.data;
	} catch (err) {
		await writeAudit({
			agentName: "esrs-report",
			action: "esrs_report_failed",
			enterpriseId,
			payload: { error: err instanceof Error ? err.message : String(err) },
		});
		return { status: "error", error: err instanceof Error ? err.message : String(err) };
	}

	await writeAudit({
		agentName: "esrs-report",
		action: "esrs_report_generated",
		enterpriseId,
		payload: {
			title: report.title,
			reportingPeriod: report.reportingPeriod,
			assuranceReadiness: report.assuranceReadiness,
			scope3tCO2e: report.esrs1Climate.scope3tCO2e,
			dataQuality: report.esrs1Climate.dataQuality,
			recommendedActionsCount: report.recommendedActions.length,
		},
	});

	return { status: "ok", report };
}

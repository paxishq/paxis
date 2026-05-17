import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { generate } from "../lib/llm";
import { writeAudit } from "../lib/audit";
import {
	enterprises,
	questionnaireResponses,
	questionnaires,
	scope3Aggregates,
} from "../db/schema";
import type { AgentContext } from "./intake";

// ── Gemini output schema ───────────────────────────────────────────────────────

const EmissionExtractionSchema = z.object({
	reasoning: z.string(),
	scope1Tonnes: z.number().nullable(),
	scope2Tonnes: z.number().nullable(),
	totalEmissionTonnes: z.number().nullable(),
});

// ── System prompt ──────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a carbon accounting assistant. Given a set of questionnaire questions and answers from a supplier,
extract the total CO₂-equivalent (tCO₂e) emission figures.

Return ONLY valid JSON:
{
  "reasoning": "<one sentence>",
  "scope1Tonnes": <number or null>,
  "scope2Tonnes": <number or null>,
  "totalEmissionTonnes": <sum of scope1 + scope2, or null if neither found>
}

If a number cannot be reliably extracted, set the field to null. Do not guess.`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return match?.[1]?.trim() ?? text.trim();
}

async function extractEmissions(
	questions: Array<{ id: string; text: string; type: string }>,
	answers: Record<string, unknown>,
): Promise<z.infer<typeof EmissionExtractionSchema>> {
	const pairs = questions
		.map((q) => `Q (${q.id}): ${q.text}\nA: ${answers[q.id] ?? "(no answer)"}`)
		.join("\n\n");

	const raw = await generate([{ role: "user", content: pairs }], {
		model: "flash",
		system: EXTRACTION_SYSTEM,
		temperature: 0.1,
	});

	const parsed = EmissionExtractionSchema.safeParse(JSON.parse(extractJson(raw)));
	if (!parsed.success) return { reasoning: "parse error", scope1Tonnes: null, scope2Tonnes: null, totalEmissionTonnes: null };
	return parsed.data;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function runSupplyChain(
	params: Record<string, unknown>,
	context: AgentContext,
): Promise<unknown> {
	const enterpriseId = context.enterpriseId;

	if (!enterpriseId) {
		await writeAudit({
			agentName: "supply-chain",
			action: "supply_chain_skipped",
			payload: { reason: "missing enterpriseId", params },
		});
		return { status: "skipped", reason: "missing enterpriseId" };
	}

	// ── Fetch enterprise metadata ──────────────────────────────────────────────

	const [enterprise] = await db
		.select()
		.from(enterprises)
		.where(eq(enterprises.id, enterpriseId));

	if (!enterprise) {
		await writeAudit({
			agentName: "supply-chain",
			action: "supply_chain_skipped",
			enterpriseId,
			payload: { reason: "enterprise not found" },
		});
		return { status: "skipped", reason: "enterprise not found" };
	}

	// ── Fetch all completed questionnaire responses ────────────────────────────

	const completedQuestionnaires = await db
		.select()
		.from(questionnaires)
		.where(
			and(
				eq(questionnaires.enterpriseId, enterpriseId),
				inArray(questionnaires.status, ["completed"]),
			),
		);

	const sentQuestionnaires = await db
		.select()
		.from(questionnaires)
		.where(
			and(
				eq(questionnaires.enterpriseId, enterpriseId),
				inArray(questionnaires.status, ["sent", "in_progress", "completed", "overdue"]),
			),
		);

	if (completedQuestionnaires.length === 0) {
		await writeAudit({
			agentName: "supply-chain",
			action: "supply_chain_completed",
			enterpriseId,
			payload: { reason: "no completed questionnaires", supplierCount: 0, co2Tonnes: 0, completionRate: 0 },
		});
		return { status: "ok", supplierCount: 0, co2Tonnes: 0, completionRate: 0 };
	}

	// ── Extract emissions from each completed questionnaire ───────────────────

	let totalCo2 = 0;
	let supplierCount = 0;

	for (const q of completedQuestionnaires) {
		const questions = q.questions as Array<{ id: string; text: string; type: string }>;

		const [response] = await db
			.select()
			.from(questionnaireResponses)
			.where(
				and(
					eq(questionnaireResponses.questionnaireId, q.id),
					eq(questionnaireResponses.supplierId, q.supplierId),
				),
			);

		if (!response?.submittedAt) continue;

		const answers = (response.answers ?? {}) as Record<string, unknown>;
		const emissions = await extractEmissions(questions, answers);

		if (emissions.totalEmissionTonnes != null) {
			totalCo2 += emissions.totalEmissionTonnes;
			supplierCount++;
		}
	}

	const completionRate =
		sentQuestionnaires.length > 0
			? completedQuestionnaires.length / sentQuestionnaires.length
			: 0;

	// ── Upsert scope3_aggregates ───────────────────────────────────────────────

	const [existing] = await db
		.select()
		.from(scope3Aggregates)
		.where(
			and(
				eq(scope3Aggregates.enterpriseId, enterpriseId),
				eq(scope3Aggregates.reportingYear, enterprise.reportingYear),
			),
		);

	if (existing) {
		await db
			.update(scope3Aggregates)
			.set({ co2Tonnes: totalCo2, supplierCount, completionRate, calculatedAt: new Date() })
			.where(eq(scope3Aggregates.id, existing.id));
	} else {
		await db.insert(scope3Aggregates).values({
			enterpriseId,
			reportingYear: enterprise.reportingYear,
			co2Tonnes: totalCo2,
			supplierCount,
			completionRate,
		});
	}

	// ── Audit ──────────────────────────────────────────────────────────────────

	await writeAudit({
		agentName: "supply-chain",
		action: "supply_chain_completed",
		enterpriseId,
		payload: {
			reportingYear: enterprise.reportingYear,
			co2Tonnes: totalCo2,
			supplierCount,
			completionRate,
			completedQuestionnaires: completedQuestionnaires.length,
			sentQuestionnaires: sentQuestionnaires.length,
		},
	});

	return {
		status: "ok",
		reportingYear: enterprise.reportingYear,
		co2Tonnes: totalCo2,
		supplierCount,
		completionRate,
	};
}

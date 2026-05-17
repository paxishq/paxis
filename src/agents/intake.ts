import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aiInventories,
  carbonEntries,
  questionnaireResponses,
  questionnaires,
} from "../db/schema";
import { writeAudit } from "../lib/audit";
import { db } from "../lib/db";
import { extractJson, generate } from "../lib/llm";

export interface AgentContext {
  enterpriseId?: string;
  supplierId?: string;
  [key: string]: unknown;
}

// ── Gemini output schema ───────────────────────────────────────────────────────

const IntakeMappingSchema = z.object({
  reasoning: z.string(),
  suggestions: z.array(
    z.object({
      questionId: z.string(),
      suggestedAnswer: z.union([z.string(), z.number(), z.boolean()]),
      confidence: z.enum(["high", "medium", "low"]),
      source: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      questionId: z.string(),
      reason: z.string(),
    }),
  ),
});

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Paxis Intake agent. Your job is to pre-fill CSRD questionnaire answers
from a supplier's existing compliance data (carbon ledger, AI inventory, etc.).

Given questionnaire questions and the supplier's existing data, produce a JSON response that:
1. Maps existing data fields to questionnaire questions where possible.
2. Suggests answers with a confidence level (high/medium/low).
3. Lists questions that cannot be answered from existing data (gaps).

For carbon questions: use the most recent entries. Sum multiple entries for the same scope.
For boolean/select questions about certifications or systems: base your answer on what is present in the data.
For questions with no corresponding data: add them to gaps.

Respond with ONLY valid JSON matching this schema:
{
  "reasoning": "<one sentence summarising your mapping strategy>",
  "suggestions": [
    {
      "questionId": "<question id>",
      "suggestedAnswer": <string | number | boolean>,
      "confidence": "high" | "medium" | "low",
      "source": "<which data field(s) you used>"
    }
  ],
  "gaps": [
    { "questionId": "<id>", "reason": "<why this cannot be auto-answered>" }
  ]
}`;

// ── Main ───────────────────────────────────────────────────────────────────────

export async function runIntake(
  params: Record<string, unknown>,
  context: AgentContext,
): Promise<unknown> {
  const questionnaireId =
    typeof params.questionnaireId === "string"
      ? params.questionnaireId
      : (context.questionnaireId as string | undefined);

  const supplierId = context.supplierId;

  if (!questionnaireId || !supplierId) {
    await writeAudit({
      agentName: "intake",
      action: "intake_skipped",
      enterpriseId: context.enterpriseId,
      supplierId,
      payload: { reason: "missing questionnaireId or supplierId", params },
    });
    return {
      status: "skipped",
      reason: "missing questionnaireId or supplierId",
    };
  }

  // ── Fetch questionnaire ───────────────────────────────────────────────────

  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.id, questionnaireId));

  if (!questionnaire) {
    await writeAudit({
      agentName: "intake",
      action: "intake_skipped",
      enterpriseId: context.enterpriseId,
      supplierId,
      payload: { reason: "questionnaire not found", questionnaireId },
    });
    return { status: "skipped", reason: "questionnaire not found" };
  }

  const questions = questionnaire.questions as Array<{
    id: string;
    text: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;

  // ── Fetch supplier's existing compliance data ─────────────────────────────

  const [existingCarbon, existingAiInventory] = await Promise.all([
    db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, supplierId)),
    db
      .select()
      .from(aiInventories)
      .where(eq(aiInventories.supplierId, supplierId)),
  ]);

  // ── Build Gemini prompt ───────────────────────────────────────────────────

  const userPrompt = `
Questionnaire: "${questionnaire.title}"

Questions:
${JSON.stringify(questions, null, 2)}

Supplier's existing data:

Carbon ledger (${existingCarbon.length} entries):
${
  existingCarbon.length === 0
    ? "No carbon entries on record."
    : JSON.stringify(
        existingCarbon.map((e) => ({
          scope: e.scope,
          co2Tonnes: e.co2Tonnes,
          periodStart: e.periodStart,
          periodEnd: e.periodEnd,
          source: e.sourceDescription,
        })),
        null,
        2,
      )
}

AI inventory (${existingAiInventory.length} systems):
${
  existingAiInventory.length === 0
    ? "No AI systems registered."
    : JSON.stringify(
        existingAiInventory.map((a) => ({
          toolName: a.toolName,
          riskTier: a.riskTier,
          description: a.description,
        })),
        null,
        2,
      )
}

Map as many questions as possible from this data. Return JSON only.`.trim();

  // ── Call Gemini ───────────────────────────────────────────────────────────

  let mapping: z.infer<typeof IntakeMappingSchema>;

  try {
    const raw = await generate([{ role: "user", content: userPrompt }], {
      model: "flash",
      system: SYSTEM_PROMPT,
      temperature: 0.1,
    });

    const parsed = IntakeMappingSchema.safeParse(JSON.parse(extractJson(raw)));

    if (!parsed.success) {
      throw new Error(
        `Intake LLM returned invalid mapping: ${parsed.error.message}`,
      );
    }

    mapping = parsed.data;
  } catch (err) {
    await writeAudit({
      agentName: "intake",
      action: "intake_mapping_failed",
      enterpriseId: context.enterpriseId,
      supplierId,
      payload: {
        questionnaireId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── Upsert draft response with pre-filled answers ─────────────────────────

  const autoAnswers: Record<string, unknown> = {};
  for (const s of mapping.suggestions) {
    autoAnswers[s.questionId] = s.suggestedAnswer;
  }

  if (mapping.suggestions.length > 0) {
    const [existing] = await db
      .select()
      .from(questionnaireResponses)
      .where(
        and(
          eq(questionnaireResponses.questionnaireId, questionnaireId),
          eq(questionnaireResponses.supplierId, supplierId),
        ),
      );

    if (existing) {
      await db
        .update(questionnaireResponses)
        .set({
          answers: {
            ...(existing.answers as Record<string, unknown>),
            ...autoAnswers,
          },
          updatedAt: new Date(),
        })
        .where(eq(questionnaireResponses.id, existing.id));
    } else {
      await db.insert(questionnaireResponses).values({
        questionnaireId,
        supplierId,
        answers: autoAnswers,
        submittedAt: null,
      });

      // Mark questionnaire in_progress so it shows up on the supplier's dashboard
      await db
        .update(questionnaires)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(questionnaires.id, questionnaireId));
    }
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  await writeAudit({
    agentName: "intake",
    action: "intake_completed",
    enterpriseId: context.enterpriseId,
    supplierId,
    payload: {
      questionnaireId,
      reasoning: mapping.reasoning,
      autoAnsweredCount: mapping.suggestions.length,
      gapCount: mapping.gaps.length,
      gaps: mapping.gaps,
    },
  });

  return {
    status: "ok",
    questionnaireId,
    autoAnsweredCount: mapping.suggestions.length,
    gapCount: mapping.gaps.length,
    reasoning: mapping.reasoning,
  };
}

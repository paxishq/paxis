import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  aiInventories,
  carbonEntries,
  questionnaireResponses,
  questionnaires,
} from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { extractJson, generate } from "../../lib/llm";
import { checkLlmRateLimit } from "../auth";

export async function getPendingQuestionnaires(supplierId: string) {
  return db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.supplierId, supplierId),
        inArray(questionnaires.status, ["sent", "in_progress", "overdue"]),
      ),
    );
}

export async function getQuestionnaire(
  supplierId: string,
  params: { questionnaireId: string },
) {
  const [q] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, params.questionnaireId),
        eq(questionnaires.supplierId, supplierId),
      ),
    );

  if (!q) return null;

  const [response] = await db
    .select()
    .from(questionnaireResponses)
    .where(eq(questionnaireResponses.questionnaireId, q.id));

  const questions = q.questions as Array<{ id: string; required?: boolean }>;
  const answers = (response?.answers ?? {}) as Record<string, unknown>;
  const gapCount = questions.filter(
    (qu) => qu.required && !answers[qu.id],
  ).length;
  const autoFilledCount = questions.filter(
    (qu) => answers[qu.id] !== undefined,
  ).length;

  return {
    questionnaire: q,
    currentResponse: response ?? null,
    autoFilledCount,
    gapCount,
  };
}

const SuggestSchema = z.object({
  suggestions: z.array(
    z.object({
      questionId: z.string(),
      suggestedAnswer: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      source: z.string(),
    }),
  ),
});

export async function suggestQuestionnaireAnswers(
  supplierId: string,
  tokenId: string,
  params: { questionnaireId: string },
) {
  if (!checkLlmRateLimit(tokenId)) {
    throw new Error("Rate limit exceeded: 20 LLM calls per minute per token");
  }

  const result = await getQuestionnaire(supplierId, params);
  if (!result) throw new Error("Questionnaire not found");

  const { questionnaire: q } = result;
  const questions = q.questions as Array<{
    id: string;
    text: string;
    type: string;
  }>;

  const [carbonData, aiData] = await Promise.all([
    db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, supplierId)),
    db
      .select()
      .from(aiInventories)
      .where(eq(aiInventories.supplierId, supplierId)),
  ]);

  const scope1Total = carbonData
    .filter((e) => e.scope === "scope1")
    .reduce((s, e) => s + e.co2Tonnes, 0);
  const scope2Total = carbonData
    .filter((e) => e.scope === "scope2")
    .reduce((s, e) => s + e.co2Tonnes, 0);

  const context = `Supplier compliance data:
- Scope 1 emissions: ${scope1Total} tCO₂e (${carbonData.filter((e) => e.scope === "scope1").length} entries)
- Scope 2 emissions: ${scope2Total} tCO₂e (${carbonData.filter((e) => e.scope === "scope2").length} entries)
- AI systems in inventory: ${aiData.length} (${aiData.filter((a) => a.riskTier === "high" || a.riskTier === "unacceptable").length} high/unacceptable risk)`;

  const prompt = `Based on the supplier's existing compliance data, suggest answers for these CSRD questionnaire questions.

${context}

Questions:
${questions.map((q) => `- ID: ${q.id} | Type: ${q.type} | Question: ${q.text}`).join("\n")}

Respond ONLY with valid JSON:
{
  "suggestions": [
    {
      "questionId": "question-id",
      "suggestedAnswer": "suggested value",
      "confidence": "high|medium|low",
      "source": "where this data came from"
    }
  ]
}`;

  const raw = await generate([{ role: "user", content: prompt }], {
    model: "flash",
    temperature: 0.2,
  });

  const parsed = SuggestSchema.safeParse(JSON.parse(extractJson(raw)));
  if (!parsed.success) {
    throw new Error(`Suggestion failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function submitQuestionnaireResponse(
  supplierId: string,
  params: { questionnaireId: string; answers: Record<string, unknown> },
) {
  const [q] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, params.questionnaireId),
        eq(questionnaires.supplierId, supplierId),
      ),
    );

  if (!q) throw new Error("Questionnaire not found");

  const [existing] = await db
    .select()
    .from(questionnaireResponses)
    .where(eq(questionnaireResponses.questionnaireId, q.id));

  let responseId: string;

  if (existing) {
    await db
      .update(questionnaireResponses)
      .set({
        answers: params.answers,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questionnaireResponses.id, existing.id));
    responseId = existing.id;
  } else {
    const [inserted] = await db
      .insert(questionnaireResponses)
      .values({
        questionnaireId: q.id,
        supplierId,
        answers: params.answers,
        submittedAt: new Date(),
      })
      .returning();
    responseId = inserted!.id;
  }

  await db
    .update(questionnaires)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(questionnaires.id, q.id));

  await writeAudit({
    agentName: "mcp",
    action: "questionnaire_submitted",
    supplierId,
    entityType: "questionnaire_responses",
    entityId: responseId,
    payload: { questionnaireId: q.id },
  });

  return { responseId, questionnaireId: q.id };
}

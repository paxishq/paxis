import { eq } from "drizzle-orm";
import { aiInventories, questionnaires } from "../../db/schema";
import { db } from "../../lib/db";
import { generate } from "../../lib/llm";
import { checkLlmRateLimit } from "../auth";
import { getCarbonSummary } from "./carbon";

const DISCLAIMER =
  "\n\n---\n*This is AI-generated guidance only. Verify with a qualified compliance advisor before acting on this information.*";

const REGULATORY_CONTEXT = `Key regulatory context:
CSRD (Corporate Sustainability Reporting Directive): Requires large EU companies to report sustainability information including GHG emissions (Scope 1, 2, 3), following ESRS standards. Scope 3 = upstream/downstream emissions from supply chain.
EU AI Act: Risk-based regulation. Prohibited (e.g. social scoring), High-risk (Annex III: biometrics, critical infrastructure, employment, law enforcement), Limited-risk (chatbots — must disclose), Minimal-risk (everything else). High-risk systems require conformity assessments, technical documentation, human oversight.`;

async function buildSupplierContext(supplierId: string): Promise<string> {
  const [summary, aiRows, pendingQ] = await Promise.all([
    getCarbonSummary(supplierId),
    db
      .select()
      .from(aiInventories)
      .where(eq(aiInventories.supplierId, supplierId)),
    db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.supplierId, supplierId)),
  ]);

  const pendingCount = pendingQ.filter(
    (q) => q.status === "sent" || q.status === "in_progress",
  ).length;

  return `Supplier compliance state:
- Scope 1: ${summary.scope1Tonnes.toFixed(2)} tCO₂e (${summary.entryCount} total entries)
- Scope 2: ${summary.scope2Tonnes.toFixed(2)} tCO₂e
- AI inventory: ${aiRows.length} systems (${aiRows.filter((a) => a.riskTier === "high" || a.riskTier === "unacceptable").length} high/unacceptable risk)
- Pending questionnaires: ${pendingCount}`;
}

export async function askComplianceQuestion(
  supplierId: string,
  tokenId: string,
  params: {
    question: string;
    context?: "csrd" | "eu-ai-act" | "carbon" | "general";
  },
) {
  if (!checkLlmRateLimit(tokenId)) {
    throw new Error("Rate limit exceeded: 20 LLM calls per minute per token");
  }

  const supplierCtx = await buildSupplierContext(supplierId);

  const system = `You are a Paxis compliance assistant helping a supplier understand their EU regulatory obligations.

${REGULATORY_CONTEXT}

${supplierCtx}

Answer the supplier's question concisely and accurately, referencing their actual data where relevant. Focus on the ${params.context ?? "general"} domain.`;

  const answer = await generate([{ role: "user", content: params.question }], {
    model: "flash",
    system,
    temperature: 0.3,
  });

  return { answer: answer + DISCLAIMER };
}

export async function explainQuestionnaireField(
  supplierId: string,
  tokenId: string,
  params: { questionnaireId: string; questionId: string },
) {
  if (!checkLlmRateLimit(tokenId)) {
    throw new Error("Rate limit exceeded: 20 LLM calls per minute per token");
  }

  const [q] = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.id, params.questionnaireId));

  if (!q) throw new Error("Questionnaire not found");

  const questions = q.questions as Array<{
    id: string;
    text: string;
    type: string;
    required?: boolean;
  }>;
  const field = questions.find((qu) => qu.id === params.questionId);
  if (!field) throw new Error("Question not found");

  const supplierCtx = await buildSupplierContext(supplierId);

  const system = `You are a Paxis compliance assistant helping a supplier fill in a CSRD questionnaire field.

${REGULATORY_CONTEXT}

${supplierCtx}`;

  const prompt = `Explain what this questionnaire field is asking for and how to answer it:

Field: "${field.text}"
Type: ${field.type}
Required: ${field.required ? "Yes" : "No"}

Explain:
1. What this question is measuring and why it matters for CSRD
2. What data the supplier should use to answer it (reference their actual data above where relevant)
3. The expected format or unit for the answer`;

  const explanation = await generate([{ role: "user", content: prompt }], {
    model: "flash",
    system,
    temperature: 0.2,
  });

  return {
    field: { id: field.id, text: field.text, type: field.type },
    explanation: explanation + DISCLAIMER,
  };
}

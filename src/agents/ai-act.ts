import { eq } from "drizzle-orm";
import { z } from "zod";
import { aiInventories } from "../db/schema";
import { writeAudit } from "../lib/audit";
import { db } from "../lib/db";
import { extractJson, generate } from "../lib/llm";
import type { AgentContext } from "./intake";

const AiActClassificationSchema = z.object({
  riskTier: z.enum(["unacceptable", "high", "limited", "minimal"]),
  justification: z.string(),
  keyRisks: z.array(z.string()),
  documentationRequired: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are a EU AI Act compliance expert. Given an AI system description, classify it by risk tier according to the EU AI Act (Regulation 2024/1689).

Risk tiers:
- unacceptable: AI systems posing unacceptable risk (banned) — social scoring, manipulation, biometric categorisation for protected attributes
- high: High-risk systems in Annex III — HR/recruitment, education/training, biometrics, critical infrastructure, law enforcement, credit scoring
- limited: Systems with transparency obligations — chatbots, emotion recognition, deepfakes, AI-generated content
- minimal: All other AI systems with minimal or no risk (e.g. spam filters, AI-assisted document editing)

Return ONLY valid JSON:
{
  "riskTier": "unacceptable" | "high" | "limited" | "minimal",
  "justification": "<one sentence explanation of the classification>",
  "keyRisks": ["<risk 1>", "<risk 2>"],
  "documentationRequired": ["<doc requirement 1>", "<doc requirement 2>"]
}`;

export async function runAiAct(
  params: Record<string, unknown>,
  context: AgentContext,
): Promise<unknown> {
  const supplierId = context.supplierId;

  if (!supplierId) {
    await writeAudit({
      agentName: "ai-act",
      action: "ai_act_skipped",
      payload: { reason: "missing supplierId", params },
    });
    return { status: "skipped", reason: "missing supplierId" };
  }

  const items = await db
    .select()
    .from(aiInventories)
    .where(eq(aiInventories.supplierId, supplierId));

  if (items.length === 0) {
    await writeAudit({
      agentName: "ai-act",
      action: "ai_act_completed",
      supplierId,
      payload: { reason: "no AI inventory items", classifiedCount: 0 },
    });
    return {
      status: "ok",
      classifiedCount: 0,
      message: "No AI inventory items to classify",
    };
  }

  let classifiedCount = 0;
  const classifications: Array<{
    id: string;
    toolName: string;
    riskTier: string;
  }> = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const item of items) {
    // Skip items reviewed within the last 30 days
    if (
      item.reviewedAt &&
      item.justification &&
      item.reviewedAt > thirtyDaysAgo
    ) {
      classifications.push({
        id: item.id,
        toolName: item.toolName,
        riskTier: item.riskTier,
      });
      continue;
    }

    const userPrompt = `AI System: "${item.toolName}"
Description: ${item.description ?? "(no description provided)"}
Current risk tier: ${item.riskTier}

Classify this system according to the EU AI Act and provide documentation requirements.`;

    try {
      const raw = await generate([{ role: "user", content: userPrompt }], {
        model: "flash",
        system: SYSTEM_PROMPT,
        temperature: 0.1,
      });

      const parsed = AiActClassificationSchema.safeParse(
        JSON.parse(extractJson(raw)),
      );

      if (parsed.success) {
        const { riskTier, justification, keyRisks, documentationRequired } =
          parsed.data;
        await db
          .update(aiInventories)
          .set({
            riskTier,
            justification: `${justification} Key risks: ${keyRisks.join(", ")}. Documentation required: ${documentationRequired.join(", ")}.`,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(aiInventories.id, item.id));

        classifications.push({
          id: item.id,
          toolName: item.toolName,
          riskTier,
        });
        classifiedCount++;
      }
    } catch {
      // Non-fatal: skip this item, continue with others
    }
  }

  await writeAudit({
    agentName: "ai-act",
    action: "ai_act_completed",
    supplierId,
    payload: {
      totalItems: items.length,
      classifiedCount,
      classifications,
    },
  });

  return {
    status: "ok",
    totalItems: items.length,
    classifiedCount,
    classifications,
  };
}

import { eq } from "drizzle-orm";
import { z } from "zod";
import { aiInventories } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { extractJson, generate } from "../../lib/llm";
import { checkLlmRateLimit } from "../auth";

export async function getAiInventory(supplierId: string) {
  return db
    .select()
    .from(aiInventories)
    .where(eq(aiInventories.supplierId, supplierId));
}

export async function addAiSystem(
  supplierId: string,
  params: {
    toolName: string;
    description?: string;
    riskTier: "unacceptable" | "high" | "limited" | "minimal";
    justification?: string;
  },
) {
  const [item] = await db
    .insert(aiInventories)
    .values({
      supplierId,
      toolName: params.toolName,
      description: params.description ?? null,
      riskTier: params.riskTier,
      justification: params.justification ?? null,
    })
    .returning();

  await writeAudit({
    agentName: "mcp",
    action: "ai_system_added",
    supplierId,
    entityType: "ai_inventories",
    entityId: item!.id,
    payload: { toolName: params.toolName, riskTier: params.riskTier },
  });

  return item!;
}

const ClassifySchema = z.object({
  riskTier: z.enum(["unacceptable", "high", "limited", "minimal"]),
  justification: z.string(),
  annexIIIReference: z.string(),
  keyRisks: z.array(z.string()),
});

const CLASSIFY_SYSTEM = `You are an EU AI Act compliance expert. Classify AI systems by risk tier under the EU AI Act.

Risk tiers:
- unacceptable: Prohibited systems (social scoring, real-time biometric surveillance, cognitive manipulation)
- high: High-risk systems listed in Annex III (biometric ID, critical infrastructure, employment decisions, law enforcement, migration, justice, essential services)
- limited: Chatbots, emotion recognition, deepfake — must disclose AI nature
- minimal: All other AI (spam filters, AI in video games, recommender systems)

Respond ONLY with valid JSON:
{
  "riskTier": "minimal|limited|high|unacceptable",
  "justification": "one paragraph explanation citing the relevant regulation text",
  "annexIIIReference": "Annex III, point X.X or 'Not applicable'",
  "keyRisks": ["risk1", "risk2"]
}`;

export async function classifyAiTool(
  _supplierId: string,
  tokenId: string,
  params: { toolName: string; description?: string; useCase?: string },
) {
  if (!checkLlmRateLimit(tokenId)) {
    throw new Error("Rate limit exceeded: 20 LLM calls per minute per token");
  }

  const prompt = `Classify this AI system under the EU AI Act:
Tool name: ${params.toolName}
Description: ${params.description ?? "Not provided"}
Use case: ${params.useCase ?? "Not provided"}`;

  const raw = await generate([{ role: "user", content: prompt }], {
    model: "flash",
    system: CLASSIFY_SYSTEM,
    temperature: 0.1,
  });

  const parsed = ClassifySchema.safeParse(JSON.parse(extractJson(raw)));
  if (!parsed.success) {
    throw new Error(`Classification failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

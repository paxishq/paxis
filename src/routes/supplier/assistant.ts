import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../../lib/audit";
import { authIdToUuid } from "../../lib/auth-helpers";
import { generate } from "../../lib/llm";
import { getAiInventory } from "../../mcp/tools/ai-inventory";
import { getCarbonSummary } from "../../mcp/tools/carbon";
import { getComplianceStatus } from "../../mcp/tools/compliance";
import { getPendingQuestionnaires } from "../../mcp/tools/questionnaires";
import type { AuthVariables } from "../../middleware/session";
import { requireAuth, requireSupplier } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

router.use("*", requireAuth, requireSupplier);

// ── Types ─────────────────────────────────────────────────────────────────────

type SupplierPage = "questionnaires" | "carbon" | "ai-inventory" | "compliance";

export interface PendingAction {
  type: "submit_questionnaire" | "add_carbon_entry" | "add_ai_system";
  [key: string]: unknown;
}

const BodySchema = z.object({
  message: z.string().min(1),
  page: z.enum(["questionnaires", "carbon", "ai-inventory", "compliance"]),
  context: z
    .object({
      questionnaireId: z.string().optional(),
      questionId: z.string().optional(),
    })
    .optional(),
});

// ── Context builders ──────────────────────────────────────────────────────────

async function buildPageContext(
  supplierId: string,
  page: SupplierPage,
): Promise<{ snapshot: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];

  if (page === "questionnaires") {
    const pending = await getPendingQuestionnaires(supplierId);
    toolsUsed.push("get_pending_questionnaires");
    return {
      snapshot: `Pending questionnaires: ${pending.length}\n${pending.map((q) => `- "${q.title}" (${q.status}, due: ${q.dueAt ?? "no due date"})`).join("\n")}`,
      toolsUsed,
    };
  }

  if (page === "carbon") {
    const summary = await getCarbonSummary(supplierId);
    toolsUsed.push("get_carbon_summary");
    return {
      snapshot: `Carbon ledger:\n- Scope 1: ${summary.scope1Tonnes.toFixed(2)} tCO₂e\n- Scope 2: ${summary.scope2Tonnes.toFixed(2)} tCO₂e\n- Total: ${summary.totalTonnes.toFixed(2)} tCO₂e\n- Entries: ${summary.entryCount}`,
      toolsUsed,
    };
  }

  if (page === "ai-inventory") {
    const inventory = await getAiInventory(supplierId);
    toolsUsed.push("get_ai_inventory");
    const byTier = { unacceptable: 0, high: 0, limited: 0, minimal: 0 };
    for (const item of inventory) byTier[item.riskTier]++;
    return {
      snapshot: `AI inventory: ${inventory.length} systems\n- Unacceptable: ${byTier.unacceptable}\n- High: ${byTier.high}\n- Limited: ${byTier.limited}\n- Minimal: ${byTier.minimal}`,
      toolsUsed,
    };
  }

  // compliance
  const status = await getComplianceStatus(supplierId);
  toolsUsed.push("get_compliance_status");
  return {
    snapshot: `Compliance status: ${status.readiness} (${status.passCount}/${status.totalChecks} checks passing)\n${status.checks.map((c) => `- ${c.done ? "✓" : "✗"} ${c.label}: ${c.detail}`).join("\n")}`,
    toolsUsed,
  };
}

// ── Parse pendingAction block ─────────────────────────────────────────────────

function extractPendingAction(raw: string): {
  reply: string;
  pendingAction: PendingAction | undefined;
} {
  const match = raw.match(/<PENDING_ACTION>([\s\S]*?)<\/PENDING_ACTION>/);
  if (!match) return { reply: raw.trim(), pendingAction: undefined };

  try {
    const pendingAction = JSON.parse(match[1]!.trim()) as PendingAction;
    const reply = raw.replace(match[0], "").trim();
    return { reply, pendingAction };
  } catch {
    return { reply: raw.trim(), pendingAction: undefined };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/chat", async (c) => {
  const user = c.get("user")!;
  const supplierId = authIdToUuid(user.supplierId);
  if (!supplierId) return c.json({ error: "Not linked to a supplier" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request body" }, 400);

  const { message, page, context } = parsed.data;

  const { snapshot, toolsUsed } = await buildPageContext(supplierId, page);

  const system = `You are the Paxis AI assistant, embedded in the Paxis supplier compliance portal. You help suppliers understand their EU CSRD and EU AI Act obligations.

Current page: ${page}
${context?.questionnaireId ? `Active questionnaire: ${context.questionnaireId}` : ""}
${context?.questionId ? `Active question: ${context.questionId}` : ""}

Supplier data snapshot:
${snapshot}

Regulatory context:
- CSRD requires Scope 1, 2, and 3 GHG emissions reporting following ESRS standards
- EU AI Act classifies AI by risk: Prohibited > High (Annex III) > Limited > Minimal
- Scope 3 = supply chain emissions; Scope 1 = direct; Scope 2 = purchased energy

For write actions (e.g. submitting a questionnaire, adding a carbon entry), include a JSON block at the end of your response in exactly this format:
<PENDING_ACTION>{"type":"submit_questionnaire","questionnaireId":"...", "answers":{...}}</PENDING_ACTION>

The user will see a confirmation button — never confirm a mutation on their behalf without their review.

Keep responses concise and practical. Always ground answers in the supplier's actual data above.`;

  const raw = await generate([{ role: "user", content: message }], {
    model: "flash",
    system,
    temperature: 0.4,
  });

  const { reply, pendingAction } = extractPendingAction(raw);

  writeAudit({
    agentName: "mcp",
    action: "assistant_query",
    supplierId,
    payload: { page, toolsUsed },
  }).catch(console.error);

  return c.json({
    reply,
    toolsUsed,
    ...(pendingAction ? { pendingAction } : {}),
  });
});

export default router;

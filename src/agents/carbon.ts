import { eq } from "drizzle-orm";
import { z } from "zod";
import { carbonEntries } from "../db/schema";
import { writeAudit } from "../lib/audit";
import { db } from "../lib/db";
import { extractJson, parseDocument } from "../lib/llm";
import type { AgentContext } from "./intake";

const DocumentParseSchema = z.object({
  reasoning: z.string(),
  entries: z.array(
    z.object({
      scope: z.enum(["scope1", "scope2"]),
      co2Tonnes: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
      sourceDescription: z.string(),
    }),
  ),
  confidence: z.enum(["high", "medium", "low"]),
  extractionNotes: z.string(),
});

const PARSE_PROMPT = `Extract CO₂-equivalent emission figures from this energy bill or utility document.

For each billing period found, identify:
- Whether it's Scope 1 (direct combustion: natural gas, fuel oil, diesel) or Scope 2 (purchased electricity or district heat)
- The total CO₂e in metric tonnes (tCO₂e). Convert from kWh using standard emission factors if needed:
  - Natural gas: 0.000202 tCO₂e/kWh
  - Electricity (EU average): 0.000276 tCO₂e/kWh
- The billing period start and end dates (ISO 8601 format, e.g. "2025-01-01")
- The source (e.g. "natural gas", "grid electricity", "district heating")

Return ONLY valid JSON:
{
  "reasoning": "<one sentence about what was found>",
  "entries": [
    {
      "scope": "scope1" | "scope2",
      "co2Tonnes": <number>,
      "periodStart": "<ISO 8601 date>",
      "periodEnd": "<ISO 8601 date>",
      "sourceDescription": "<description>"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "extractionNotes": "<any caveats, conversion assumptions, or missing data>"
}`;

export async function runCarbon(
  params: Record<string, unknown>,
  context: AgentContext,
): Promise<unknown> {
  const supplierId = context.supplierId;

  if (!supplierId) {
    await writeAudit({
      agentName: "carbon",
      action: "carbon_skipped",
      payload: { reason: "missing supplierId", params },
    });
    return { status: "skipped", reason: "missing supplierId" };
  }

  // ── Document parsing mode ─────────────────────────────────────────────────

  const docData = params.documentData as string | undefined;
  const docMimeType = params.mimeType as string | undefined;

  if (docData && docMimeType) {
    let parseResult: z.infer<typeof DocumentParseSchema>;

    try {
      const raw = await parseDocument(
        { data: docData, mimeType: docMimeType },
        PARSE_PROMPT,
      );
      const parsed = DocumentParseSchema.safeParse(
        JSON.parse(extractJson(raw)),
      );

      if (!parsed.success) {
        throw new Error(
          `Carbon LLM returned invalid data: ${parsed.error.message}`,
        );
      }
      parseResult = parsed.data;
    } catch (err) {
      await writeAudit({
        agentName: "carbon",
        action: "carbon_parse_failed",
        supplierId,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      return {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const insertedIds: string[] = [];
    for (const entry of parseResult.entries) {
      const [inserted] = await db
        .insert(carbonEntries)
        .values({
          supplierId,
          scope: entry.scope,
          co2Tonnes: entry.co2Tonnes,
          periodStart: new Date(entry.periodStart),
          periodEnd: new Date(entry.periodEnd),
          sourceDescription: entry.sourceDescription,
          parsedFromDocument: true,
        })
        .returning({ id: carbonEntries.id });
      if (inserted) insertedIds.push(inserted.id);
    }

    await writeAudit({
      agentName: "carbon",
      action: "carbon_document_parsed",
      supplierId,
      payload: {
        confidence: parseResult.confidence,
        reasoning: parseResult.reasoning,
        extractionNotes: parseResult.extractionNotes,
        entriesInserted: insertedIds.length,
      },
    });

    return {
      status: "ok",
      mode: "document_parsed",
      entriesInserted: insertedIds.length,
      confidence: parseResult.confidence,
      reasoning: parseResult.reasoning,
    };
  }

  // ── Summary mode (no document — summarise existing entries) ──────────────

  const allEntries = await db
    .select()
    .from(carbonEntries)
    .where(eq(carbonEntries.supplierId, supplierId));

  const scope1Total = allEntries
    .filter((e) => e.scope === "scope1")
    .reduce((sum, e) => sum + e.co2Tonnes, 0);

  const scope2Total = allEntries
    .filter((e) => e.scope === "scope2")
    .reduce((sum, e) => sum + e.co2Tonnes, 0);

  await writeAudit({
    agentName: "carbon",
    action: "carbon_summarised",
    supplierId,
    payload: {
      totalEntries: allEntries.length,
      scope1Tonnes: scope1Total,
      scope2Tonnes: scope2Total,
      totalTonnes: scope1Total + scope2Total,
    },
  });

  return {
    status: "ok",
    mode: "summary",
    totalEntries: allEntries.length,
    scope1Tonnes: scope1Total,
    scope2Tonnes: scope2Total,
    totalTonnes: scope1Total + scope2Total,
  };
}

import { and, desc, eq } from "drizzle-orm";
import { carbonEntries } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";

export async function getCarbonSummary(supplierId: string) {
  const rows = await db
    .select()
    .from(carbonEntries)
    .where(eq(carbonEntries.supplierId, supplierId));

  const scope1Tonnes = rows
    .filter((r) => r.scope === "scope1")
    .reduce((s, r) => s + r.co2Tonnes, 0);
  const scope2Tonnes = rows
    .filter((r) => r.scope === "scope2")
    .reduce((s, r) => s + r.co2Tonnes, 0);

  const sorted = [...rows].sort(
    (a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
  );
  const latestPeriod = sorted[0]
    ? {
        start: sorted[0].periodStart,
        end: sorted[0].periodEnd,
      }
    : null;

  return {
    scope1Tonnes,
    scope2Tonnes,
    totalTonnes: scope1Tonnes + scope2Tonnes,
    entryCount: rows.length,
    latestPeriod,
  };
}

export async function getCarbonEntries(
  supplierId: string,
  params: { scope?: "scope1" | "scope2"; limit?: number } = {},
) {
  const { scope, limit = 50 } = params;

  const conditions = [eq(carbonEntries.supplierId, supplierId)];
  if (scope) conditions.push(eq(carbonEntries.scope, scope));

  const rows = await db
    .select()
    .from(carbonEntries)
    .where(and(...conditions))
    .orderBy(desc(carbonEntries.periodEnd))
    .limit(limit);

  return rows;
}

export async function addCarbonEntry(
  supplierId: string,
  params: {
    scope: "scope1" | "scope2";
    periodStart: string;
    periodEnd: string;
    co2Tonnes: number;
    sourceDescription?: string;
  },
) {
  const [entry] = await db
    .insert(carbonEntries)
    .values({
      supplierId,
      scope: params.scope,
      periodStart: new Date(params.periodStart),
      periodEnd: new Date(params.periodEnd),
      co2Tonnes: params.co2Tonnes,
      sourceDescription: params.sourceDescription ?? null,
      parsedFromDocument: false,
    })
    .returning();

  await writeAudit({
    agentName: "mcp",
    action: "carbon_entry_added",
    supplierId,
    entityType: "carbon_entries",
    entityId: entry!.id,
    payload: { scope: params.scope, co2Tonnes: params.co2Tonnes },
  });

  return entry!;
}

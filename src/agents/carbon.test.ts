import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, carbonEntries, suppliers } from "../db/schema";
import { db } from "../lib/db";

const TEST_SUPPLIER_ID = "00000000-0000-0000-0000-000000000011";

const VALID_DOC_RESPONSE = JSON.stringify({
  reasoning: "Found electricity bill for January",
  entries: [
    {
      scope: "scope2",
      co2Tonnes: 1.38,
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      sourceDescription: "grid electricity",
    },
  ],
  confidence: "high",
  extractionNotes: "Direct kWh to tCO2e using EU average factor",
});

let returnInvalidDoc = false;

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  return raw.trim();
}

mock.module("../lib/llm", () => ({
  generate: async () => "{}",
  extractJson,
  parseDocument: async () => {
    if (returnInvalidDoc) {
      return '{"wrong_field": true}';
    }
    return VALID_DOC_RESPONSE;
  },
}));

const { runCarbon } = await import("./carbon");

beforeAll(async () => {
  await db
    .insert(suppliers)
    .values({
      id: TEST_SUPPLIER_ID,
      name: "Carbon Test Supplier",
      country: "DE",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(carbonEntries)
    .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));
  await db.delete(auditLog).where(eq(auditLog.supplierId, TEST_SUPPLIER_ID));
  await db.delete(suppliers).where(eq(suppliers.id, TEST_SUPPLIER_ID));
});

describe("runCarbon — summary mode", () => {
  it("writes a carbon_summarised audit log entry", async () => {
    await runCarbon({}, { supplierId: TEST_SUPPLIER_ID });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.supplierId, TEST_SUPPLIER_ID),
          eq(auditLog.action, "carbon_summarised"),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("carbon");
  });

  it("returns status ok with scope totals", async () => {
    const result = await runCarbon({}, { supplierId: TEST_SUPPLIER_ID });
    expect((result as { status: string }).status).toBe("ok");
    expect((result as { mode: string }).mode).toBe("summary");
  });
});

describe("runCarbon — missing supplierId", () => {
  it("writes a carbon_skipped audit entry and returns skipped", async () => {
    const result = await runCarbon({}, {});

    expect((result as { status: string }).status).toBe("skipped");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "carbon_skipped"))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("carbon");
  });
});

describe("runCarbon — document mode", () => {
  it("inserts a carbon_entries row and writes carbon_document_parsed audit entry", async () => {
    const before = await db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));

    await runCarbon(
      { documentData: "base64data", mimeType: "image/png" },
      { supplierId: TEST_SUPPLIER_ID },
    );

    const after = await db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));

    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)!.scope).toBe("scope2");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.supplierId, TEST_SUPPLIER_ID),
          eq(auditLog.action, "carbon_document_parsed"),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
  });

  it("writes carbon_parse_failed audit entry when LLM returns invalid structure", async () => {
    returnInvalidDoc = true;

    const result = await runCarbon(
      { documentData: "base64data", mimeType: "image/png" },
      { supplierId: TEST_SUPPLIER_ID },
    );

    returnInvalidDoc = false;

    expect((result as { status: string }).status).toBe("error");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.supplierId, TEST_SUPPLIER_ID),
          eq(auditLog.action, "carbon_parse_failed"),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("carbon");
  });
});

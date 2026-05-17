import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, enterprises } from "../db/schema";
import { db } from "../lib/db";

const TEST_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000022";

const VALID_ESRS_RESPONSE = JSON.stringify({
  title: "Paxis Test Co CSRD Report 2025",
  reportingPeriod: "FY2025",
  executiveSummary:
    "The company is progressing on its sustainability commitments.",
  esrs2General: {
    governanceOverview: "Board-level ESG committee established.",
    strategyAndBusinessModel: "Sustainability embedded in product development.",
    materialTopics: ["Climate change", "Supply chain emissions"],
  },
  esrs1Climate: {
    scope1tCO2e: 0,
    scope2tCO2e: 0,
    scope3tCO2e: null,
    totalGHG: 0,
    dataQuality: "low",
    gapsAndLimitations: "No supplier data available yet.",
  },
  supplierDataQuality: {
    totalSuppliersContacted: 0,
    responsesReceived: 0,
    completionRatePercent: 0,
  },
  recommendedActions: [
    "Collect supplier emissions data",
    "Set reduction targets",
  ],
  assuranceReadiness: "not_ready",
});

let returnInvalidReport = false;

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  return raw.trim();
}

mock.module("../lib/llm", () => ({
  generate: async () => {
    if (returnInvalidReport) {
      return '{"wrong_field": true}';
    }
    return VALID_ESRS_RESPONSE;
  },
  extractJson,
  parseDocument: async () => "{}",
}));

const { runEsrsReport } = await import("./esrs-report");

beforeAll(async () => {
  await db
    .insert(enterprises)
    .values({
      id: TEST_ENTERPRISE_ID,
      name: "ESRS Test Enterprise",
      country: "DE",
      reportingYear: 2025,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.enterpriseId, TEST_ENTERPRISE_ID));
  await db.delete(enterprises).where(eq(enterprises.id, TEST_ENTERPRISE_ID));
});

describe("runEsrsReport — missing enterpriseId", () => {
  it("writes esrs_report_skipped audit entry and returns skipped", async () => {
    const result = await runEsrsReport({}, {});

    expect((result as { status: string }).status).toBe("skipped");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "esrs_report_skipped"))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("esrs-report");
  });
});

describe("runEsrsReport — valid enterprise", () => {
  it("writes esrs_report_generated audit entry on success", async () => {
    const result = await runEsrsReport(
      {},
      { enterpriseId: TEST_ENTERPRISE_ID },
    );

    expect((result as { status: string }).status).toBe("ok");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.enterpriseId, TEST_ENTERPRISE_ID),
          eq(auditLog.action, "esrs_report_generated"),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("esrs-report");
  });

  it("writes esrs_report_failed audit entry when LLM returns invalid structure", async () => {
    returnInvalidReport = true;

    const result = await runEsrsReport(
      {},
      { enterpriseId: TEST_ENTERPRISE_ID },
    );

    returnInvalidReport = false;

    expect((result as { status: string }).status).toBe("error");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.enterpriseId, TEST_ENTERPRISE_ID),
          eq(auditLog.action, "esrs_report_failed"),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("esrs-report");
  });
});

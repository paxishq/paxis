import { and, desc, eq } from "drizzle-orm";
import {
  aiInventories,
  auditLog,
  carbonEntries,
  questionnaires,
} from "../../db/schema";
import { db } from "../../lib/db";

export async function getComplianceStatus(supplierId: string) {
  const [carbonRows, aiRows, questionnaireRows] = await Promise.all([
    db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, supplierId)),
    db
      .select()
      .from(aiInventories)
      .where(eq(aiInventories.supplierId, supplierId)),
    db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.supplierId, supplierId)),
  ]);

  const hasScope1 = carbonRows.some((e) => e.scope === "scope1");
  const hasScope2 = carbonRows.some((e) => e.scope === "scope2");
  const scope1Total = carbonRows
    .filter((e) => e.scope === "scope1")
    .reduce((s, e) => s + e.co2Tonnes, 0);
  const scope2Total = carbonRows
    .filter((e) => e.scope === "scope2")
    .reduce((s, e) => s + e.co2Tonnes, 0);
  const hasHighRisk = aiRows.some(
    (a) => a.riskTier === "unacceptable" || a.riskTier === "high",
  );
  const totalQ = questionnaireRows.length;
  const completedQ = questionnaireRows.filter(
    (q) => q.status === "completed",
  ).length;
  const pendingQ = questionnaireRows.filter(
    (q) => q.status === "sent" || q.status === "in_progress",
  ).length;
  const overdueQ = questionnaireRows.filter(
    (q) => q.status === "overdue",
  ).length;

  const checks = [
    {
      label: "Scope 1 emissions logged",
      done: hasScope1,
      detail: hasScope1
        ? `${scope1Total.toFixed(2)} tCO₂e`
        : "Add at least one Scope 1 entry",
    },
    {
      label: "Scope 2 emissions logged",
      done: hasScope2,
      detail: hasScope2
        ? `${scope2Total.toFixed(2)} tCO₂e`
        : "Add at least one Scope 2 entry",
    },
    {
      label: "AI inventory registered",
      done: aiRows.length > 0,
      detail: `${aiRows.length} system(s)`,
    },
    {
      label: "No unacceptable or high-risk AI",
      done: !hasHighRisk,
      detail: hasHighRisk
        ? "Review flagged systems"
        : "All within acceptable tiers",
    },
    {
      label: "All questionnaires responded",
      done: totalQ > 0 && pendingQ === 0 && overdueQ === 0,
      detail:
        totalQ === 0
          ? "None received yet"
          : `${completedQ}/${totalQ} completed`,
    },
  ];

  const passCount = checks.filter((c) => c.done).length;
  const readiness =
    passCount === checks.length
      ? "ready"
      : passCount >= 3
        ? "partial"
        : "not_ready";

  return {
    checks,
    passCount,
    totalChecks: checks.length,
    readiness,
    summary: {
      scope1TotalTonnes: scope1Total,
      scope2TotalTonnes: scope2Total,
      aiSystemCount: aiRows.length,
      pendingQuestionnaires: pendingQ,
      overdueQuestionnaires: overdueQ,
    },
  };
}

export async function getDeadlineCalendar(supplierId: string) {
  const [latestRisk] = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.supplierId, supplierId),
        eq(auditLog.agentName, "risk-deadline"),
        eq(auditLog.action, "risk_deadline_assessed"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  const staticDeadlines = [
    {
      regulation: "CSRD",
      milestone: "Large companies first report",
      date: "2025-01-01",
      description: "FY2024 data required for companies with 500+ employees",
    },
    {
      regulation: "CSRD",
      milestone: "Mid-size companies first report",
      date: "2026-01-01",
      description: "FY2025 data required for companies with 250+ employees",
    },
    {
      regulation: "EU AI Act",
      milestone: "Prohibited AI systems",
      date: "2025-02-02",
      description: "Prohibited AI systems must be removed from operation",
    },
    {
      regulation: "EU AI Act",
      milestone: "High-risk AI obligations",
      date: "2026-08-02",
      description: "Full compliance required for high-risk AI systems",
    },
    {
      regulation: "EU AI Act",
      milestone: "GPAI obligations",
      date: "2025-08-02",
      description: "General-purpose AI model obligations apply",
    },
  ];

  const agentFlags = latestRisk
    ? ((latestRisk.payload as { flags?: unknown[] } | null)?.flags ?? [])
    : [];

  return {
    upcoming: staticDeadlines,
    agentFlags,
    lastAssessedAt: latestRisk?.createdAt ?? null,
  };
}

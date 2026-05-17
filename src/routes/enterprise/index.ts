import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { dispatchPlan } from "../../agents/planner";
import {
  agentJobs,
  auditLog,
  enterprises,
  scope3Aggregates,
} from "../../db/schema";
import { authIdToUuid } from "../../lib/auth-helpers";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";
import { requireAuth, requireEnterprise } from "../../middleware/session";
import carbonRoutes from "./carbon";
import questionnaireRoutes from "./questionnaires";
import supplierRoutes from "./suppliers";

const enterprise = new Hono<{ Variables: AuthVariables }>();

enterprise.use("*", requireAuth, requireEnterprise);

enterprise.get("/me", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [ent] = await db
    .select()
    .from(enterprises)
    .where(eq(enterprises.id, enterpriseId));

  if (!ent) return c.json({ error: "Enterprise not found" }, 404);

  return c.json(ent);
});

enterprise.route("/suppliers", supplierRoutes);
enterprise.route("/questionnaires", questionnaireRoutes);
enterprise.route("/carbon", carbonRoutes);

enterprise.get("/scope3", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const rows = await db
    .select()
    .from(scope3Aggregates)
    .where(eq(scope3Aggregates.enterpriseId, enterpriseId))
    .orderBy(desc(scope3Aggregates.calculatedAt));

  return c.json(rows);
});

// ── Risk & Deadline ───────────────────────────────────────────────────────────

enterprise.post("/risk/assess", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const { runRiskDeadline } = await import("../../agents/risk-deadline");
  runRiskDeadline({}, { enterpriseId }).catch(console.error);

  return c.json({ status: "assessing" }, 202);
});

enterprise.get("/risk/latest", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [entry] = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.enterpriseId, enterpriseId),
        eq(auditLog.agentName, "risk-deadline"),
        eq(auditLog.action, "risk_deadline_assessed"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (!entry) return c.json({ error: "No assessment yet" }, 404);

  const payload = entry.payload as { [k: string]: unknown };
  return c.json({ assessedAt: entry.createdAt, ...payload });
});

// ── ESRS Report ───────────────────────────────────────────────────────────────

enterprise.post("/reports/esrs", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [ent] = await db
    .select()
    .from(enterprises)
    .where(eq(enterprises.id, enterpriseId));

  if (!ent) return c.json({ error: "Enterprise not found" }, 404);

  const { jobId } = await dispatchPlan({
    type: "esrs_report_requested",
    enterpriseId,
    reportingYear: ent.reportingYear,
  });

  return c.json(
    {
      status: "generating",
      jobId,
      message:
        "Report generation started. Poll GET /reports/esrs/latest for the result.",
    },
    202,
  );
});

enterprise.get("/reports/esrs/latest", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [entry] = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.enterpriseId, enterpriseId),
        eq(auditLog.agentName, "esrs-report"),
        eq(auditLog.action, "esrs_report_generated"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (!entry) return c.json({ error: "No report generated yet" }, 404);

  const payload = entry.payload as { report: unknown; [k: string]: unknown };
  return c.json({ generatedAt: entry.createdAt, ...payload });
});

// ── Job status ────────────────────────────────────────────────────────────────

enterprise.get("/jobs/:id", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [job] = await db
    .select()
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.id, c.req.param("id")),
        eq(agentJobs.enterpriseId, enterpriseId),
      ),
    );

  if (!job) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: job.id,
    status: job.status,
    taskType: job.taskType,
    lastError: job.lastError,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

export default enterprise;

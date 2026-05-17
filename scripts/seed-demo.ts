/**
 * Demo seed — realistic multi-supplier data for hackathon presentation.
 * Safe to run multiple times (idempotent on fixed UUIDs).
 *
 * Run: bun scripts/seed-demo.ts
 */

import { and, eq } from "drizzle-orm";
import {
  aiInventories,
  carbonEntries,
  enterpriseSuppliers,
  questionnaireResponses,
  questionnaires,
  scope3Aggregates,
  suppliers,
} from "../src/db/schema";
import { db } from "../src/lib/db";

// ── Fixed IDs ──────────────────────────────────────────────────────────────────

const E1 = "00000000-0000-4000-a000-000000000001"; // Acme Corp (dev) — already exists

const S1 = "00000000-0000-4000-a000-000000000002"; // BoltCo GmbH (dev) — already exists
const S2 = "00000000-0000-4000-a000-000000000003"; // SteelWorks AG
const S3 = "00000000-0000-4000-a000-000000000004"; // GreenPackaging BV
const S4 = "00000000-0000-4000-a000-000000000005"; // LogiTrans SRL

const Q1 = "00000000-0000-4000-b000-000000000001"; // Sent to BoltCo — completed
const Q2 = "00000000-0000-4000-b000-000000000002"; // Sent to SteelWorks — in_progress
const Q3 = "00000000-0000-4000-b000-000000000003"; // Sent to GreenPackaging — sent
const Q4 = "00000000-0000-4000-b000-000000000004"; // Sent to LogiTrans — overdue
const Q5 = "00000000-0000-4000-b000-000000000005"; // Second round BoltCo — draft

const QUESTIONS = [
  {
    id: "q1",
    text: "What were your total Scope 1 (direct combustion) CO₂e emissions in metric tonnes for the reporting year?",
    type: "number",
    required: true,
  },
  {
    id: "q2",
    text: "What were your total Scope 2 (purchased electricity/heat) CO₂e emissions in metric tonnes?",
    type: "number",
    required: true,
  },
  {
    id: "q3",
    text: "Do you have a verified carbon footprint or ISO 14064 certification?",
    type: "boolean",
    required: false,
  },
  {
    id: "q4",
    text: "What is your primary energy source for operations?",
    type: "text",
    required: false,
  },
  {
    id: "q5",
    text: "Do you have an EU AI Act compliance program in place?",
    type: "boolean",
    required: false,
  },
  {
    id: "q6",
    text: "How many AI systems do you operate that may fall under the EU AI Act?",
    type: "number",
    required: false,
  },
];

// ── Upsert helpers ─────────────────────────────────────────────────────────────

async function upsertSupplier(
  id: string,
  name: string,
  vatNumber: string,
  country: string,
) {
  await db
    .insert(suppliers)
    .values({ id, name, vatNumber, country })
    .onConflictDoNothing();
}

async function upsertLink(enterpriseId: string, supplierId: string) {
  const existing = await db
    .select()
    .from(enterpriseSuppliers)
    .where(
      and(
        eq(enterpriseSuppliers.enterpriseId, enterpriseId),
        eq(enterpriseSuppliers.supplierId, supplierId),
      ),
    );
  if (existing.length === 0) {
    await db.insert(enterpriseSuppliers).values({ enterpriseId, supplierId });
  }
}

async function upsertQuestionnaire(
  id: string,
  enterpriseId: string,
  supplierId: string,
  title: string,
  status: "draft" | "sent" | "in_progress" | "completed" | "overdue",
  dueAt: Date,
  sentAt: Date | null = null,
  completedAt: Date | null = null,
) {
  await db
    .insert(questionnaires)
    .values({
      id,
      enterpriseId,
      supplierId,
      title,
      status,
      dueAt,
      sentAt,
      completedAt,
      questions: QUESTIONS,
    })
    .onConflictDoNothing();
}

async function upsertResponse(
  questionnaireId: string,
  supplierId: string,
  answers: Record<string, unknown>,
  submittedAt: Date | null,
) {
  const existing = await db
    .select()
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.questionnaireId, questionnaireId),
        eq(questionnaireResponses.supplierId, supplierId),
      ),
    );
  if (existing.length === 0) {
    await db.insert(questionnaireResponses).values({
      questionnaireId,
      supplierId,
      answers,
      submittedAt,
    });
  }
}

// ── Seed ───────────────────────────────────────────────────────────────────────

// Additional suppliers
await upsertSupplier(S2, "SteelWorks AG", "DE555444333", "DE");
await upsertSupplier(S3, "GreenPackaging BV", "NL987123456", "NL");
await upsertSupplier(S4, "LogiTrans SRL", "IT123987654", "IT");

// Link all to enterprise
await upsertLink(E1, S2);
await upsertLink(E1, S3);
await upsertLink(E1, S4);

// Questionnaire 1: BoltCo — completed
await upsertQuestionnaire(
  Q1,
  E1,
  S1,
  "CSRD Scope 3 & EU AI Act Survey 2025",
  "completed",
  new Date("2025-09-30"),
  new Date("2025-07-01"),
  new Date("2025-08-15"),
);
await upsertResponse(
  Q1,
  S1,
  {
    q1: 142.7,
    q2: 89.3,
    q3: true,
    q4: "Mix of natural gas (60%) and grid electricity (40%)",
    q5: false,
    q6: 0,
  },
  new Date("2025-08-15"),
);

// Questionnaire 2: SteelWorks — in_progress
await upsertQuestionnaire(
  Q2,
  E1,
  S2,
  "CSRD Scope 3 & EU AI Act Survey 2025",
  "in_progress",
  new Date("2025-10-31"),
  new Date("2025-07-15"),
);
await upsertResponse(
  Q2,
  S2,
  {
    q1: 2840.5,
    q2: 1120.0,
    q4: "Natural gas and coal for furnaces",
  },
  null,
);

// Questionnaire 3: GreenPackaging — sent (no response yet)
await upsertQuestionnaire(
  Q3,
  E1,
  S3,
  "CSRD Scope 3 & EU AI Act Survey 2025",
  "sent",
  new Date("2025-11-30"),
  new Date("2025-08-01"),
);

// Questionnaire 4: LogiTrans — overdue
await upsertQuestionnaire(
  Q4,
  E1,
  S4,
  "CSRD Scope 3 & EU AI Act Survey 2025",
  "overdue",
  new Date("2025-06-30"),
  new Date("2025-04-01"),
);

// Questionnaire 5: BoltCo Q2 round — draft
await upsertQuestionnaire(
  Q5,
  E1,
  S1,
  "CSRD Mid-Year Emissions Update 2025",
  "draft",
  new Date("2026-03-31"),
);

// Carbon entries for S1 (BoltCo) — matches questionnaire answers
const s1Carbon = await db
  .select()
  .from(carbonEntries)
  .where(eq(carbonEntries.supplierId, S1));

if (s1Carbon.length === 0) {
  await db.insert(carbonEntries).values([
    {
      supplierId: S1,
      scope: "scope1",
      co2Tonnes: 142.7,
      periodStart: new Date("2024-01-01"),
      periodEnd: new Date("2024-12-31"),
      sourceDescription: "Natural gas heating and machinery",
      parsedFromDocument: false,
    },
    {
      supplierId: S1,
      scope: "scope2",
      co2Tonnes: 89.3,
      periodStart: new Date("2024-01-01"),
      periodEnd: new Date("2024-12-31"),
      sourceDescription: "Grid electricity (DE mix)",
      parsedFromDocument: false,
    },
  ]);
}

// AI inventory for S1 (BoltCo)
const s1Ai = await db
  .select()
  .from(aiInventories)
  .where(eq(aiInventories.supplierId, S1));

if (s1Ai.length === 0) {
  await db.insert(aiInventories).values([
    {
      supplierId: S1,
      toolName: "SAP Predictive Analytics",
      description:
        "Demand forecasting for inventory management — no automated decision-making affecting individuals",
      riskTier: "minimal",
      justification:
        "Used solely for supply chain optimisation; no Annex III use case.",
    },
  ]);
}

// Scope 3 aggregate for E1 (from completed questionnaire: 142.7 + 89.3 = 232 tCO₂e)
const existing3 = await db
  .select()
  .from(scope3Aggregates)
  .where(eq(scope3Aggregates.enterpriseId, E1));

if (existing3.length === 0) {
  await db.insert(scope3Aggregates).values({
    enterpriseId: E1,
    reportingYear: 2025,
    co2Tonnes: 232.0,
    supplierCount: 1,
    completionRate: 0.25,
  });
}

console.log("Demo seed complete.");
console.log(
  "  Suppliers: BoltCo (completed), SteelWorks (in_progress), GreenPackaging (sent), LogiTrans (overdue)",
);
console.log(
  "  Scope 3: 232 tCO₂e from 1 completed supplier (25% completion rate)",
);
console.log("  Carbon entries: BoltCo scope1=142.7, scope2=89.3");
console.log("  AI inventory: BoltCo — SAP Predictive Analytics (minimal risk)");

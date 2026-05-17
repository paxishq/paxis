import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ── Enums ────────────────────────────────────────────────────────────────────

export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "draft",
  "sent",
  "in_progress",
  "completed",
  "overdue",
]);

export const aiRiskTierEnum = pgEnum("ai_risk_tier", [
  "unacceptable",
  "high",
  "limited",
  "minimal",
]);

export const agentNameEnum = pgEnum("agent_name", [
  "planner",
  "intake",
  "ai-act",
  "carbon",
  "supply-chain",
  "risk-deadline",
  "esrs-report",
]);

export const emissionsScopeEnum = pgEnum("emissions_scope", ["scope1", "scope2"]);

// ── Enterprises ──────────────────────────────────────────────────────────────

export const enterprises = pgTable("enterprises", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vatNumber: text("vat_number"),
  country: text("country").notNull(),
  reportingYear: integer("reporting_year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vatNumber: text("vat_number"),
  country: text("country").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Enterprise ↔ Supplier relationships ─────────────────────────────────────

export const enterpriseSuppliers = pgTable(
  "enterprise_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enterpriseId: uuid("enterprise_id")
      .notNull()
      .references(() => enterprises.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("enterprise_suppliers_enterprise_idx").on(t.enterpriseId),
    index("enterprise_suppliers_supplier_idx").on(t.supplierId),
  ],
);

// ── Relations ────────────────────────────────────────────────────────────────
// auth-schema.ts owns user ↔ session/account relations; we extend here for domain tables.

export const enterpriseRelations = relations(enterprises, ({ many }) => ({
  users: many(user),
  suppliers: many(enterpriseSuppliers),
}));

export const supplierRelations = relations(suppliers, ({ many }) => ({
  users: many(user),
  enterprises: many(enterpriseSuppliers),
}));

export const enterpriseSuppliersRelations = relations(enterpriseSuppliers, ({ one }) => ({
  enterprise: one(enterprises, {
    fields: [enterpriseSuppliers.enterpriseId],
    references: [enterprises.id],
  }),
  supplier: one(suppliers, {
    fields: [enterpriseSuppliers.supplierId],
    references: [suppliers.id],
  }),
}));

export const userDomainRelations = relations(user, ({ one }) => ({
  enterprise: one(enterprises, {
    fields: [user.enterpriseId],
    references: [enterprises.id],
  }),
  supplier: one(suppliers, {
    fields: [user.supplierId],
    references: [suppliers.id],
  }),
}));

// ── Questionnaires ───────────────────────────────────────────────────────────

export const questionnaires = pgTable(
  "questionnaires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enterpriseId: uuid("enterprise_id")
      .notNull()
      .references(() => enterprises.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: questionnaireStatusEnum("status").notNull().default("draft"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    questions: jsonb("questions").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("questionnaires_enterprise_idx").on(t.enterpriseId),
    index("questionnaires_supplier_idx").on(t.supplierId),
    index("questionnaires_status_idx").on(t.status),
  ],
);

export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionnaireId: uuid("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull().default("{}"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("questionnaire_responses_questionnaire_idx").on(t.questionnaireId)],
);

// ── EU AI Act Inventory ──────────────────────────────────────────────────────

export const aiInventories = pgTable(
  "ai_inventories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    description: text("description"),
    riskTier: aiRiskTierEnum("risk_tier").notNull(),
    justification: text("justification"),
    documentationUrl: text("documentation_url"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_inventories_supplier_idx").on(t.supplierId)],
);

// ── Carbon Entries (Scope 1 & 2 ledger — append-only) ───────────────────────

export const carbonEntries = pgTable(
  "carbon_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    scope: emissionsScopeEnum("scope").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    co2Tonnes: real("co2_tonnes").notNull(),
    sourceDescription: text("source_description"),
    evidenceUrl: text("evidence_url"),
    parsedFromDocument: boolean("parsed_from_document").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("carbon_entries_supplier_idx").on(t.supplierId),
    index("carbon_entries_scope_idx").on(t.scope),
  ],
);

// ── Scope 3 Aggregates ───────────────────────────────────────────────────────

export const scope3Aggregates = pgTable(
  "scope3_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enterpriseId: uuid("enterprise_id")
      .notNull()
      .references(() => enterprises.id, { onDelete: "cascade" }),
    reportingYear: integer("reporting_year").notNull(),
    co2Tonnes: real("co2_tonnes").notNull(),
    supplierCount: integer("supplier_count").notNull(),
    completionRate: real("completion_rate").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("scope3_aggregates_enterprise_idx").on(t.enterpriseId)],
);

// ── Audit Log (append-only — written exclusively by agent functions) ─────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentName: agentNameEnum("agent_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    enterpriseId: uuid("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_agent_idx").on(t.agentName),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_enterprise_idx").on(t.enterpriseId),
    index("audit_log_supplier_idx").on(t.supplierId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

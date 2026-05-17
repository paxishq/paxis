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

// ── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["enterprise_admin", "supplier_node"]);

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

// ── Better Auth tables (managed by bunx auth@latest generate) ────────────────
// Do not edit these manually.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("supplier_node"),
  enterpriseId: uuid("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

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

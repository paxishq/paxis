import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { auditLog, carbonEntries, suppliers } from "../../db/schema";
import { db } from "../../lib/db";
import { addCarbonEntry, getCarbonSummary } from "./carbon";

const TEST_SUPPLIER_ID = "00000000-0000-0000-0000-000000000051";

beforeAll(async () => {
  await db
    .insert(suppliers)
    .values({ id: TEST_SUPPLIER_ID, name: "Carbon MCP Test", country: "FR" })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(carbonEntries)
    .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));
  await db.delete(auditLog).where(eq(auditLog.supplierId, TEST_SUPPLIER_ID));
  await db.delete(suppliers).where(eq(suppliers.id, TEST_SUPPLIER_ID));
});

describe("getCarbonSummary", () => {
  it("returns zero totals when no entries exist", async () => {
    const summary = await getCarbonSummary(TEST_SUPPLIER_ID);
    expect(summary.scope1Tonnes).toBe(0);
    expect(summary.scope2Tonnes).toBe(0);
    expect(summary.totalTonnes).toBe(0);
    expect(summary.entryCount).toBe(0);
    expect(summary.latestPeriod).toBeNull();
  });

  it("returns correct totals after inserting entries", async () => {
    await addCarbonEntry(TEST_SUPPLIER_ID, {
      scope: "scope1",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      co2Tonnes: 100,
      sourceDescription: "Gas boiler",
    });
    await addCarbonEntry(TEST_SUPPLIER_ID, {
      scope: "scope2",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      co2Tonnes: 50.5,
    });

    const summary = await getCarbonSummary(TEST_SUPPLIER_ID);
    expect(summary.scope1Tonnes).toBe(100);
    expect(summary.scope2Tonnes).toBe(50.5);
    expect(summary.totalTonnes).toBe(150.5);
    expect(summary.entryCount).toBe(2);
  });
});

describe("addCarbonEntry", () => {
  it("inserts a row in carbon_entries", async () => {
    const before = await db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));

    await addCarbonEntry(TEST_SUPPLIER_ID, {
      scope: "scope1",
      periodStart: "2024-04-01",
      periodEnd: "2024-06-30",
      co2Tonnes: 25,
      sourceDescription: "Diesel fleet",
    });

    const after = await db
      .select()
      .from(carbonEntries)
      .where(eq(carbonEntries.supplierId, TEST_SUPPLIER_ID));

    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)!.co2Tonnes).toBe(25);
    expect(after.at(-1)!.parsedFromDocument).toBe(false);
  });

  it("writes an audit log entry with agentName mcp", async () => {
    await addCarbonEntry(TEST_SUPPLIER_ID, {
      scope: "scope2",
      periodStart: "2024-04-01",
      periodEnd: "2024-06-30",
      co2Tonnes: 12.3,
    });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.supplierId, TEST_SUPPLIER_ID),
          eq(auditLog.action, "carbon_entry_added"),
        ),
      )
      .orderBy(auditLog.createdAt)
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("mcp");
  });
});

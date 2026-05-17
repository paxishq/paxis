import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { suppliers } from "../../db/schema";
import { db } from "../../lib/db";

const TEST_SUPPLIER_ID = "00000000-0000-0000-0000-000000000054";

// Must mock before dynamic imports
mock.module("../../lib/llm", () => ({
  generate: async (_msgs: unknown, _opts: unknown) => {
    return "Here is your answer.";
  },
  extractJson: (raw: string) => raw,
}));

// Set the dev supplier ID so the session middleware bypass injects auth
Bun.env.DEV_SUPPLIER_ID = TEST_SUPPLIER_ID;

const { default: app } = await import("../../app");

beforeAll(async () => {
  await db
    .insert(suppliers)
    .values({
      id: TEST_SUPPLIER_ID,
      name: "Assistant Test Supplier",
      country: "NL",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(suppliers).where(eq(suppliers.id, TEST_SUPPLIER_ID));
  Bun.env.DEV_SUPPLIER_ID = undefined as unknown as string;
});

describe("POST /api/supplier/assistant/chat", () => {
  it("returns 401 when not authenticated", async () => {
    // Temporarily unset dev bypass
    const saved = Bun.env.DEV_SUPPLIER_ID;
    Bun.env.DEV_SUPPLIER_ID = undefined as unknown as string;

    const res = await app.request("/api/supplier/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello", page: "questionnaires" }),
    });

    Bun.env.DEV_SUPPLIER_ID = saved;
    // Without a session, requireAuth returns 401
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await app.request("/api/supplier/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "", page: "questionnaires" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns reply and toolsUsed for a valid question", async () => {
    const res = await app.request("/api/supplier/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What are my pending questionnaires?",
        page: "questionnaires",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; toolsUsed: string[] };
    expect(typeof body.reply).toBe("string");
    expect(Array.isArray(body.toolsUsed)).toBe(true);
    expect(body.toolsUsed).toContain("get_pending_questionnaires");
  });

  it("parses pendingAction from PENDING_ACTION block in LLM output", async () => {
    // Override generate to return a response with a PENDING_ACTION block
    mock.module("../../lib/llm", () => ({
      generate: async () => {
        return 'Sure, I can do that. <PENDING_ACTION>{"type":"add_carbon_entry","scope":"scope1","co2Tonnes":100,"periodStart":"2024-01-01","periodEnd":"2024-03-31"}</PENDING_ACTION>';
      },
      extractJson: (raw: string) => raw,
    }));

    const res = await app.request("/api/supplier/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Add 100 tonnes of scope 1 for Q1 2024",
        page: "carbon",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      pendingAction?: { type: string };
    };
    expect(body.pendingAction).toBeDefined();
    expect(body.pendingAction!.type).toBe("add_carbon_entry");
    // The PENDING_ACTION block should be stripped from reply
    expect(body.reply).not.toContain("<PENDING_ACTION>");
  });
});

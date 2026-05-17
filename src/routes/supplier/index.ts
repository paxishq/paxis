import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { suppliers } from "../../db/schema";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";
import { requireAuth, requireSupplier } from "../../middleware/session";
import aiInventoryRoutes from "./ai-inventory";
import assistantRoutes from "./assistant";
import carbonRoutes from "./carbon";
import mcpTokenRoutes from "./mcp-tokens";
import questionnaireRoutes from "./questionnaires";

const supplier = new Hono<{ Variables: AuthVariables }>();

supplier.use("*", requireAuth, requireSupplier);

supplier.get("/me", async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const [sup] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, user.supplierId));

  if (!sup) return c.json({ error: "Supplier not found" }, 404);

  return c.json(sup);
});

supplier.route("/questionnaires", questionnaireRoutes);
supplier.route("/ai-inventory", aiInventoryRoutes);
supplier.route("/carbon", carbonRoutes);
supplier.route("/mcp-tokens", mcpTokenRoutes);
supplier.route("/assistant", assistantRoutes);

export default supplier;

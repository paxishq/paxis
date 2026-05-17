import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth";

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

export type AuthVariables = {
  user: SessionUser | null;
  session: SessionData | null;
};

const DEV_SESSION = {
  id: "dev-session",
  token: "dev-token",
  userId: "dev-user",
  expiresAt: new Date("2099-01-01"),
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: null,
  userAgent: null,
} satisfies SessionData;

function devUser(
  role: "enterprise_admin" | "supplier_node",
  enterpriseId: string | null,
  supplierId: string | null,
): SessionUser {
  return {
    id: "dev-user",
    name:
      role === "enterprise_admin" ? "Dev Enterprise User" : "Dev Supplier User",
    email:
      role === "enterprise_admin" ? "dev@enterprise.test" : "dev@supplier.test",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role,
    enterpriseId,
    supplierId,
  } satisfies SessionUser;
}

export const sessionMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (Bun.env.NODE_ENV !== "production") {
      const path = c.req.path;
      const eid = Bun.env.DEV_ENTERPRISE_ID ?? null;
      const sid = Bun.env.DEV_SUPPLIER_ID ?? null;
      if (path.startsWith("/api/enterprise/") && eid) {
        c.set("user", devUser("enterprise_admin", eid, null));
        c.set("session", DEV_SESSION);
        await next();
        return;
      }
      if (path.startsWith("/api/supplier/") && sid) {
        c.set("user", devUser("supplier_node", null, sid));
        c.set("session", DEV_SESSION);
        await next();
        return;
      }
    }

    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", data?.user ?? null);
    c.set("session", data?.session ?? null);
    await next();
  },
);

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (!c.get("user")) return c.json({ error: "Unauthorized" }, 401);
    await next();
  },
);

export const requireEnterprise = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user || user.role !== "enterprise_admin")
      return c.json({ error: "Forbidden" }, 403);
    await next();
  },
);

export const requireSupplier = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user || user.role !== "supplier_node")
      return c.json({ error: "Forbidden" }, 403);
    await next();
  },
);

import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth";

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

export type AuthVariables = {
	user: SessionUser | null;
	session: SessionData | null;
};

export const sessionMiddleware = createMiddleware<{ Variables: AuthVariables }>(
	async (c, next) => {
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

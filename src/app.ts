import { Hono } from "hono";
import { auth } from "./lib/auth";
import { type AuthVariables, sessionMiddleware } from "./middleware/session";
import enterpriseRoutes from "./routes/enterprise/index";
import supplierRoutes from "./routes/supplier/index";

export const app = new Hono<{ Variables: AuthVariables }>();

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/*", sessionMiddleware);

app.route("/api/enterprise", enterpriseRoutes);
app.route("/api/supplier", supplierRoutes);

export default app;

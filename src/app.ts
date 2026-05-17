import { Hono } from "hono";
import { auth } from "./lib/auth";
import { type AuthVariables, sessionMiddleware } from "./middleware/session";

export const app = new Hono<{ Variables: AuthVariables }>();

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/*", sessionMiddleware);

export default app;

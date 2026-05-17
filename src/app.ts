import { Hono } from "hono";
import { auth } from "./lib/auth";

export const app = new Hono();

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export default app;

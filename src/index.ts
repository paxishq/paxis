import { unlinkSync } from "node:fs";
import app from "./app";
import enterpriseApp from "./frontend/enterprise/App.html";
import supplierApp from "./frontend/supplier/App.html";
import { startMcpServer } from "./mcp/server";

const isProd = Bun.env.NODE_ENV === "production";

if (isProd) {
  try { unlinkSync("/run/paxis/app.sock"); } catch {}
}

Bun.serve({
  ...(isProd
    ? { unix: "/run/paxis/app.sock" }
    : { port: Number(Bun.env.PORT ?? 15150) }),
  routes: {
    "/api/*": app.fetch,
    "/supplier": supplierApp,
    "/supplier/*": supplierApp,
    "/*": enterpriseApp,
  },
});

startMcpServer();

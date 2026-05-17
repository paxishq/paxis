import app from "./app";
import enterpriseApp from "./frontend/enterprise/App.html";
import supplierApp from "./frontend/supplier/App.html";

const isProd = Bun.env.NODE_ENV === "production";

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

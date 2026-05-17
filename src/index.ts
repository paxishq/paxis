const isProd = Bun.env.NODE_ENV === "production";

Bun.serve({
	...(isProd
		? { unix: "/run/paxis/app.sock" }
		: { port: Number(Bun.env.PORT ?? 15150) }),
	fetch(_req: Request) {
		return new Response("ok");
	},
});

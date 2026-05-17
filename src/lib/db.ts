import postgres from "postgres";

const isProd = Bun.env.NODE_ENV === "production";

// prod: unix socket — peer auth, no password needed
// dev:  DATABASE_URL from compose.yml / .env
const client = postgres(
	isProd
		? "postgres:///paxis?host=/var/run/postgresql"
		: (Bun.env.DATABASE_URL ?? "postgres://paxis:paxis@localhost:5432/paxis"),
);

export const db = client;

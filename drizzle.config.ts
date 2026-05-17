import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/*.ts",
	out: "./src/db/migrations",
	dbCredentials: {
		url: Bun.env.DATABASE_URL!,
	},
});

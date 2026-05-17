import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: Bun.env.BETTER_AUTH_SECRET!,
  baseURL: Bun.env.BETTER_AUTH_URL ?? "http://localhost:15150",
  socialProviders: {
    google: {
      clientId: Bun.env.GOOGLE_CLIENT_ID!,
      clientSecret: Bun.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "supplier_node",
        required: true,
        input: false,
      },
      enterpriseId: {
        type: "string",
        required: false,
        input: false,
      },
      supplierId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});

import { db } from "../src/lib/db";
import { enterprises, suppliers, enterpriseSuppliers } from "../src/db/schema";
import { eq } from "drizzle-orm";

// Fixed UUIDs so the script is idempotent — safe to run multiple times.
const DEV_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000001";
const DEV_SUPPLIER_ID = "00000000-0000-0000-0000-000000000002";

await db
	.insert(enterprises)
	.values({
		id: DEV_ENTERPRISE_ID,
		name: "Acme Corp (dev)",
		vatNumber: "DE123456789",
		country: "DE",
		reportingYear: 2025,
	})
	.onConflictDoNothing();

await db
	.insert(suppliers)
	.values({
		id: DEV_SUPPLIER_ID,
		name: "BoltCo GmbH (dev)",
		vatNumber: "DE987654321",
		country: "DE",
	})
	.onConflictDoNothing();

const existing = await db
	.select()
	.from(enterpriseSuppliers)
	.where(eq(enterpriseSuppliers.enterpriseId, DEV_ENTERPRISE_ID));

if (existing.length === 0) {
	await db.insert(enterpriseSuppliers).values({
		enterpriseId: DEV_ENTERPRISE_ID,
		supplierId: DEV_SUPPLIER_ID,
	});
}

console.log("Dev seed complete. Add to .env:\n");
console.log(`DEV_ENTERPRISE_ID="${DEV_ENTERPRISE_ID}"`);
console.log(`DEV_SUPPLIER_ID="${DEV_SUPPLIER_ID}"`);

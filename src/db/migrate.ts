import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const schema = await readFile(schemaPath, "utf8");
  const sql = neon(connectionString);
  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log("Database schema is up to date.");
}

void migrate();

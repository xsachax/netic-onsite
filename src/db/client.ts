import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseUnavailableError();
  }

  client ??= neon(connectionString);
  return client;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Persistent game storage is not configured.");
    this.name = "DatabaseUnavailableError";
  }
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Не задан DATABASE_URL — смотри .env.example");

const client = postgres(url);
export const db = drizzle(client, { schema });
export { schema };

#!/usr/bin/env node
/**
 * Aplica schema.sql + place_order.sql + seed.sql a la base de datos.
 * Uso: DATABASE_URL="postgres://…" node scripts/setup-db.mjs
 *
 * No requiere psql. Divide el SQL respetando bloques $$ … $$ de PostgreSQL.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { splitStatements } from "./split-sql.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. Ejemplo:\n  DATABASE_URL='postgres://…' node scripts/setup-db.mjs");
  process.exit(1);
}

const sql = neon(url);
const files = [
  "db/schema.sql",
  "db/place_order.sql",
  "db/seed.sql",
];

for (const file of files) {
  const text = await readFile(path.join(root, file), "utf8");
  const statements = splitStatements(text);
  process.stdout.write(`\n▸ ${file} (${statements.length} sentencias)\n`);
  for (const [n, statement] of statements.entries()) {
    const label = statement.split("\n")[0].slice(0, 70);
    try {
      await sql.query(statement);
      process.stdout.write(`  ✓ ${n + 1}. ${label}\n`);
    } catch (err) {
      process.stdout.write(`  ✗ ${n + 1}. ${label}\n\n${err.message}\n`);
      process.exit(1);
    }
  }
}

console.log("\n✓ Base de datos lista.");

import { neon } from "@neondatabase/serverless";

let cached = null;

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL (cadena de conexión de PostgreSQL)."
    );
  }
  if (!cached) cached = neon(url);
  return cached;
}

/** Ejecuta SQL y devuelve las filas. */
export async function q(text, params = []) {
  return client().query(text, params);
}

/** Ejecuta SQL y devuelve la primera fila (o null). */
export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] ?? null;
}

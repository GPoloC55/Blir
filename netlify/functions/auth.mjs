import { json, adminPassword, makeSessionCookie, clearSessionCookie, isAuthed } from "../lib/common.mjs";

export default async (req) => {
  if (req.method === "GET") {
    return json({ authed: isAuthed(req) });
  }

  if (req.method === "POST") {
    try {
      const { password } = await req.json();
      if (password && password === adminPassword()) {
        return json({ ok: true }, 200, { "set-cookie": makeSessionCookie() });
      }
      return json({ error: "Contraseña incorrecta" }, 401);
    } catch {
      return json({ error: "Solicitud inválida" }, 400);
    }
  }

  if (req.method === "DELETE") {
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  return json({ error: "Método no permitido" }, 405);
};

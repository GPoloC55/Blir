import { json, adminPassword, makeSessionCookie, clearSessionCookie, isAuthed, configError, safeEqual } from "../lib/common.mjs";

export default async (req) => {
  if (req.method === "GET") {
    return json({ authed: isAuthed(req), configured: !configError() });
  }

  if (req.method === "POST") {
    const cfg = configError();
    if (cfg) return json({ error: cfg }, 503);
    try {
      const { password } = await req.json();
      if (password && safeEqual(password, adminPassword())) {
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

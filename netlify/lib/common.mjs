import crypto from "node:crypto";

const SECRET = process.env.AUTH_SECRET || "cambia-esta-clave-en-netlify";
const COOKIE = "blir_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "blir-demo-2026";
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function makeSessionCookie() {
  const token = sign({ role: "admin", exp: Date.now() + MAX_AGE * 1000 });
  return `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax; Secure`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export function isAuthed(req) {
  return Boolean(verify(getCookie(req, COOKIE)));
}

/** Respuesta estándar para endpoints de administración. */
export function requireAdmin(req) {
  if (!isAuthed(req)) return json({ error: "No autorizado" }, 401);
  return null;
}

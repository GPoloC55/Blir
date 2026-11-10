import crypto from "node:crypto";
import { q } from "../lib/db.mjs";
import { json } from "../lib/common.mjs";
import { getPayment, mpConfigured } from "../lib/payments.mjs";

/**
 * POST /api/webhook-mercadopago
 * Mercado Pago avisa aquí cuando cambia un pago. Verificamos la firma y
 * consultamos el pago directamente a su API antes de marcar el pedido.
 */
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!mpConfigured()) return json({ ok: true, ignored: true });

  const url = new URL(req.url);
  const paymentId =
    url.searchParams.get("data.id") ||
    (await req.clone().json().catch(() => ({})))?.data?.id;

  // Verificación de firma (si MP_WEBHOOK_SECRET está configurado)
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret && paymentId) {
    const signature = req.headers.get("x-signature") || "";
    const requestId = req.headers.get("x-request-id") || "";
    const parts = Object.fromEntries(
      signature.split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      })
    );
    const manifest = `id:${paymentId};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");
    if (parts.v1 !== expected) {
      console.warn("Webhook MP: firma inválida");
      return json({ error: "Firma inválida" }, 401);
    }
  }

  if (!paymentId) return json({ ok: true, ignored: true });

  try {
    const payment = await getPayment(paymentId);
    const orderId = payment.external_reference;
    if (!orderId) return json({ ok: true, ignored: true });

    if (payment.status === "approved") {
      await q(`select mark_order_paid($1, 'mercadopago', $2)`, [orderId, String(paymentId)]);
    } else if (payment.status === "refunded") {
      await q(
        `update orders set payment_status='refunded', status='refunded', updated_at=now() where id=$1`,
        [orderId]
      );
    }
    return json({ ok: true });
  } catch (err) {
    console.error("webhook MP:", err);
    // 500 hace que Mercado Pago reintente
    return json({ error: "Error procesando el pago" }, 500);
  }
};

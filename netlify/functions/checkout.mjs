import { q, one } from "../lib/db.mjs";
import { json } from "../lib/common.mjs";
import { createPreference, mpConfigured } from "../lib/payments.mjs";

/**
 * POST /api/checkout
 * Crea el pedido (descontando stock de forma atómica) y devuelve la URL de pago.
 * Si Mercado Pago no está configurado, responde en modo sandbox.
 */
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  if (!Array.isArray(body.items) || !body.items.length) {
    return json({ error: "El carrito está vacío." }, 400);
  }
  const c = body.customer || {};
  if (!c.name || !c.email || !c.phone) {
    return json({ error: "Faltan datos de contacto." }, 400);
  }
  if ((body.shipping_method || "pickup") !== "pickup") {
    const a = body.shipping_address || {};
    if (!a.street || !a.city || !a.state || !a.zip) {
      return json({ error: "Falta la dirección de envío." }, 400);
    }
  }

  // 1) Pedido atómico
  let order;
  try {
    const rows = await q(`select place_order($1::jsonb) as r`, [JSON.stringify(body)]);
    order = rows[0].r;
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("OUT_OF_STOCK")) {
      const [, name, size] = msg.split(":");
      return json(
        { error: `Se agotó ${name}${size ? ` talla ${size}` : ""}. Ajusta tu carrito.`, code: "OUT_OF_STOCK" },
        409
      );
    }
    console.error("checkout place_order:", err);
    return json({ error: "No se pudo crear el pedido." }, 500);
  }

  // 2) Datos para la pasarela
  const items = await q(
    `select sku, name, size, qty, unit_price_cents from order_items where order_id=$1`,
    [order.id]
  );
  const full = await one(`select * from orders where id=$1`, [order.id]);

  const origin = new URL(req.url).origin;
  const baseUrl = process.env.URL || process.env.SITE_URL || origin;

  if (!mpConfigured()) {
    return json({
      ok: true,
      sandbox: true,
      order_id: order.id,
      total_cents: order.total_cents,
      redirect: `/gracias?order=${order.id}&sandbox=1`,
      note: "Mercado Pago no está configurado: el pedido se creó sin cobro.",
    });
  }

  try {
    const pref = await createPreference({ order: full, items, baseUrl });
    await q(
      `update orders set payment_provider='mercadopago', payment_id=$2, updated_at=now()
       where id=$1`,
      [order.id, String(pref.id)]
    );
    return json({
      ok: true,
      order_id: order.id,
      total_cents: order.total_cents,
      init_point: pref.init_point,
      redirect: pref.init_point,
    });
  } catch (err) {
    console.error("checkout preference:", err);
    return json({
      error: "El pedido se creó pero no se pudo abrir el pago. Escríbenos por WhatsApp.",
      order_id: order.id,
    }, 502);
  }
};

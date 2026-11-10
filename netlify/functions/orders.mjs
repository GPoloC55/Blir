import { q, one } from "../lib/db.mjs";
import { json, requireAdmin } from "../lib/common.mjs";

const ORDER_SELECT = `
  select o.*,
    coalesce((
      select json_agg(json_build_object(
        'sku', i.sku, 'name', i.name, 'size', i.size, 'color', i.color,
        'qty', i.qty, 'unit_price_cents', i.unit_price_cents,
        'total_cents', i.total_cents
      ) order by i.name)
      from order_items i where i.order_id = o.id
    ), '[]') as items
  from orders o
`;

function validate(body) {
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return "El carrito está vacío.";
  }
  for (const it of body.items) {
    if (!it.variant_id || !(parseInt(it.qty, 10) > 0)) {
      return "Hay un artículo inválido en el carrito.";
    }
  }
  const c = body.customer || {};
  if (!c.name || !String(c.name).trim()) return "Falta el nombre.";
  const email = String(c.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Falta un correo válido.";
  if (!c.phone || String(c.phone).replace(/\D/g, "").length < 10) {
    return "Falta un teléfono válido.";
  }
  if ((body.shipping_method || "pickup") !== "pickup") {
    const a = body.shipping_address || {};
    if (!a.street || !a.city || !a.state || !a.zip) {
      return "Falta la dirección de envío completa.";
    }
  }
  return null;
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const denied = requireAdmin(req);
    if (denied) return denied;
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(500, parseInt(url.searchParams.get("limit"), 10) || 100);

    const rows = await q(
      `${ORDER_SELECT}
       where ($1 = '' or o.status = $1)
         and ($2 = '' or o.id ilike '%' || $2 || '%'
              or coalesce(o.customer->>'email','') ilike '%' || $2 || '%'
              or coalesce(o.customer->>'name','')  ilike '%' || $2 || '%')
       order by o.created_at desc
       limit $3`,
      [status || "", search, limit]
    );
    return json({ orders: rows });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Solicitud inválida" }, 400);
    }
    const error = validate(body);
    if (error) return json({ error }, 400);

    try {
      const rows = await q(`select place_order($1::jsonb) as r`, [JSON.stringify(body)]);
      return json({ ok: true, ...rows[0].r });
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("OUT_OF_STOCK")) {
        const [, name, size] = msg.split(":");
        return json(
          { error: `Se agotó ${name}${size ? ` talla ${size}` : ""}. Ajusta tu carrito.`, code: "OUT_OF_STOCK" },
          409
        );
      }
      if (msg.includes("VARIANT_NOT_FOUND")) {
        return json({ error: "Un producto del carrito ya no está disponible.", code: "VARIANT_NOT_FOUND" }, 409);
      }
      if (msg.includes("EMPTY_CART")) return json({ error: "El carrito está vacío." }, 400);
      console.error("orders POST:", err);
      return json({ error: "No se pudo crear el pedido." }, 500);
    }
  }

  if (req.method === "PUT") {
    const denied = requireAdmin(req);
    if (denied) return denied;
    try {
      const b = await req.json();
      if (!b.id) return json({ error: "Falta el id del pedido" }, 400);

      if (b.status === "cancelled") {
        const rows = await q(`select cancel_order($1) as r`, [b.id]);
        return json({ ok: true, order: rows[0].r });
      }

      const row = await one(
        `update orders set
           status = coalesce(nullif($2::text,''), status),
           payment_status = coalesce(nullif($3::text,''), payment_status),
           tracking_number = coalesce(nullif($4::text,''), tracking_number),
           tracking_url = coalesce(nullif($5::text,''), tracking_url),
           notes = coalesce($6::text, notes),
           paid_at = case when $3::text = 'paid' then coalesce(paid_at, now()) else paid_at end,
           shipped_at = case when $2::text = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
           delivered_at = case when $2::text = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
           updated_at = now()
         where id = $1
         returning *`,
        [b.id, b.status || "", b.payment_status || "", b.tracking_number || "",
         b.tracking_url || "", b.notes ?? null]
      );
      if (!row) return json({ error: "Pedido no encontrado" }, 404);
      return json({ ok: true, order: row });
    } catch (err) {
      console.error("orders PUT:", err);
      return json({ error: "Solicitud inválida" }, 400);
    }
  }

  return json({ error: "Método no permitido" }, 405);
};

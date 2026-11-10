import { q, one } from "../lib/db.mjs";
import { json, requireAdmin } from "../lib/common.mjs";

export default async (req) => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("low") === "1") {
      const rows = await q(
        `select v.id, v.sku, p.name as product, v.size, v.stock, p.price_cents,
                p.cost_cents, v.stock * p.cost_cents as capital_cents
         from variants v join products p on p.id = v.product_id
         where v.active and p.active and v.stock <= $1
         order by v.stock asc, p.name`,
        [parseInt(url.searchParams.get("threshold"), 10) || 3]
      );
      return json({ items: rows });
    }

    const rows = await q(
      `select m.id, m.created_at, m.delta, m.reason, m.order_id, m.note,
              v.sku, v.size, p.name as product
       from inventory_movements m
       join variants v on v.id = m.variant_id
       join products p on p.id = v.product_id
       order by m.created_at desc
       limit $1`,
      [Math.min(500, parseInt(url.searchParams.get("limit"), 10) || 100)]
    );
    return json({ movements: rows });
  }

  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (!b.variant_id) return json({ error: "Falta variant_id" }, 400);
      const delta = parseInt(b.delta, 10);
      if (!Number.isFinite(delta) || delta === 0) {
        return json({ error: "delta debe ser distinto de cero" }, 400);
      }
      const reason = ["purchase", "adjustment", "return", "cancel"].includes(b.reason)
        ? b.reason
        : "adjustment";

      const row = await one(
        `update variants set stock = stock + $2
         where id = $1 and stock + $2 >= 0
         returning id, sku, size, stock`,
        [b.variant_id, delta]
      );
      if (!row) {
        return json({ error: "El ajuste dejaría el stock en negativo o la variante no existe." }, 409);
      }
      await q(
        `insert into inventory_movements (variant_id, delta, reason, note)
         values ($1, $2, $3, $4)`,
        [b.variant_id, delta, reason, b.note || ""]
      );
      return json({ ok: true, variant: row });
    } catch (err) {
      console.error("inventory POST:", err);
      return json({ error: "Solicitud inválida" }, 400);
    }
  }

  return json({ error: "Método no permitido" }, 405);
};

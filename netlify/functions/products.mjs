import { q } from "../lib/db.mjs";
import { json, isAuthed, requireAdmin } from "../lib/common.mjs";

const LIST = `
  select p.id, p.slug, p.sku_base, p.name, p.description, p.category,
         p.price_cents, p.compare_at_cents, p.image_url,
         case when $1::boolean then p.cost_cents else null end as cost_cents,
         p.badge, p.active, p.sort,
         coalesce(
           json_agg(
             json_build_object(
               'id', v.id, 'sku', v.sku, 'size', v.size, 'color', v.color,
               'stock', v.stock, 'price_cents', v.price_cents, 'active', v.active
             ) order by v.sort
           ) filter (where v.id is not null),
           '[]'
         ) as variants
  from products p
  left join variants v on v.product_id = p.id and ($1::boolean or v.active)
  where ($1::boolean or p.active)
  group by p.id
  order by p.sort, p.name
`;

export default async (req) => {
  const url = new URL(req.url);
  const admin = isAuthed(req) && url.searchParams.get("scope") === "admin";

  if (req.method === "GET") {
    const products = await q(LIST, [admin]);
    return json({ products });
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (!b.name || !b.category || !b.sku_base) {
        return json({ error: "Faltan campos: name, category, sku_base" }, 400);
      }
      const price = Number(b.price_cents);
      if (!Number.isFinite(price) || price < 0) {
        return json({ error: "price_cents inválido" }, 400);
      }

      let id = b.id || null;
      if (id) {
        await q(
          `update products set name=$2, description=$3, category=$4, price_cents=$5,
             compare_at_cents=$6, cost_cents=$7, image_url=$8, badge=$9, active=$10,
             sort=$11, updated_at=now()
           where id=$1`,
          [id, b.name, b.description || "", b.category, price,
           b.compare_at_cents || null, b.cost_cents || 0, b.image_url || "",
           b.badge || "", b.active !== false, b.sort || 0]
        );
      } else {
        const slug = (b.slug || b.name)
          .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const row = await q(
          `insert into products (slug, sku_base, name, description, category,
             price_cents, compare_at_cents, cost_cents, image_url, badge, active, sort)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
          [slug, b.sku_base, b.name, b.description || "", b.category, price,
           b.compare_at_cents || null, b.cost_cents || 0, b.image_url || "",
           b.badge || "", b.active !== false, b.sort || 0]
        );
        id = row[0].id;
      }

      const variants = Array.isArray(b.variants) ? b.variants : [];
      const keep = [];
      for (const v of variants) {
        const stock = Math.max(0, parseInt(v.stock, 10) || 0);
        const vprice = Number.isFinite(Number(v.price_cents)) ? Number(v.price_cents) : price;
        if (v.id) {
          await q(
            `update variants set size=$2, color=$3, stock=$4, price_cents=$5, active=true
             where id=$1 and product_id=$6`,
            [v.id, v.size || "", v.color || "", stock, vprice, id]
          );
          keep.push(v.id);
        } else {
          const sku = v.sku || `${b.sku_base}-${(v.size || "").toUpperCase()}`;
          const row = await q(
            `insert into variants (product_id, sku, size, color, stock, price_cents)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (sku) do update set stock=$5, price_cents=$6, active=true
             returning id`,
            [id, sku, v.size || "", v.color || "", stock, vprice]
          );
          keep.push(row[0].id);
        }
      }
      await q(
        `update variants set active=false where product_id=$1 and not (id = any($2::uuid[]))`,
        [id, keep]
      );

      const products = await q(LIST, [true]);
      return json({ ok: true, id, products });
    } catch (err) {
      console.error("products POST:", err);
      return json({ error: err.message || "Solicitud inválida" }, 400);
    }
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Falta id" }, 400);
    await q(`update products set active=false, updated_at=now() where id=$1`, [id]);
    await q(`update variants set active=false where product_id=$1`, [id]);
    return json({ ok: true });
  }

  return json({ error: "Método no permitido" }, 405);
};

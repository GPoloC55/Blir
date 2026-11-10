import { q } from "../lib/db.mjs";
import { json } from "../lib/common.mjs";
import { mpConfigured } from "../lib/payments.mjs";

/**
 * GET /api/shop
 * Todo lo que la tienda necesita en una sola llamada: catálogo con stock,
 * categorías, precios de mayoreo, métodos de envío y configuración.
 */
const PRODUCTS = `
  select p.id, p.slug, p.sku_base, p.name, p.description, p.category,
         p.price_cents, p.compare_at_cents, p.image_url, p.badge, p.sort,
         coalesce(
           json_agg(
             json_build_object(
               'id', v.id, 'sku', v.sku, 'size', v.size,
               'stock', v.stock, 'price_cents', v.price_cents
             ) order by v.sort
           ) filter (where v.id is not null),
           '[]'
         ) as variants
  from products p
  left join variants v on v.product_id = p.id and v.active
  where p.active
  group by p.id
  order by p.sort, p.name
`;

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const [products, categories, shipping, tiers, settings] = await Promise.all([
    q(PRODUCTS),
    q(`select slug, name, sort from categories where active order by sort`),
    q(`select code, label, price_cents from shipping_methods where active order by sort`),
    q(`select min_qty, price_cents from wholesale_tiers order by min_qty desc`),
    q(`select value from settings where key = 'store'`),
  ]);

  return json(
    {
      products,
      categories,
      shipping,
      wholesale_tiers: tiers,
      store: settings[0]?.value || {},
      payments_enabled: mpConfigured(),
    },
    200,
    { "cache-control": "public, max-age=30, stale-while-revalidate=120" }
  );
};

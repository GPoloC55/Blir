import { q } from "../lib/db.mjs";
import { json, requireAdmin } from "../lib/common.mjs";

export default async (req) => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days"), 10) || 30));
  const staleDays = Math.min(365, Math.max(7, parseInt(url.searchParams.get("stale"), 10) || 60));

  const [kpis, daily, top, byCategory, dead, inventory, low, byMethod] = await Promise.all([
    q(
      `with o as (
         select * from orders where paid_at >= now() - ($1 || ' days')::interval
       )
       select
         (select count(*) from o)::int as orders,
         (select coalesce(sum(total_cents), 0) from o)::bigint as revenue_cents,
         (select coalesce(round(avg(total_cents)), 0) from o)::bigint as aov_cents,
         (select coalesce(sum(oi.qty), 0)
            from order_items oi where oi.order_id in (select id from o))::int as units,
         (select coalesce(sum(discount_cents), 0) from o)::bigint as discounts_cents`,
      [days]
    ),
    q(
      `select to_char(d::date, 'YYYY-MM-DD') as day,
              coalesce(sum(o.total_cents), 0)::bigint as revenue_cents,
              count(o.id)::int as orders
       from generate_series(
              current_date - ($1::int - 1), current_date, interval '1 day'
            ) d
       left join orders o on o.paid_at::date = d::date
       group by d order by d`,
      [days]
    ),
    q(
      `select p.name, p.sku_base,
              sum(oi.qty)::int as units,
              sum(oi.total_cents)::bigint as revenue_cents
       from order_items oi
       join orders o on o.id = oi.order_id
       join variants v on v.id = oi.variant_id
       join products p on p.id = v.product_id
       where o.paid_at >= now() - ($1 || ' days')::interval
       group by p.name, p.sku_base
       order by units desc
       limit 12`,
      [days]
    ),
    q(
      `select p.category,
              sum(oi.qty)::int as units,
              sum(oi.total_cents)::bigint as revenue_cents
       from order_items oi
       join orders o on o.id = oi.order_id
       join variants v on v.id = oi.variant_id
       join products p on p.id = v.product_id
       where o.paid_at >= now() - ($1 || ' days')::interval
       group by p.category order by revenue_cents desc`,
      [days]
    ),
    q(`select * from dead_stock($1::int) limit 40`, [staleDays]),
    q(
      `select count(*)::int as variants,
              coalesce(sum(v.stock), 0)::int as units,
              coalesce(sum(v.stock * p.price_cents), 0)::bigint as retail_cents,
              coalesce(sum(v.stock * p.cost_cents), 0)::bigint as capital_cents
       from variants v join products p on p.id = v.product_id
       where v.active and p.active`
    ),
    q(
      `select v.sku, p.name as product, v.size, v.stock
       from variants v join products p on p.id = v.product_id
       where v.active and p.active and v.stock <= 2
       order by v.stock asc, p.name limit 40`
    ),
    q(
      `select shipping_method,
              count(*)::int as orders,
              coalesce(sum(total_cents), 0)::bigint as revenue_cents
       from orders
       where paid_at >= now() - ($1 || ' days')::interval
       group by shipping_method order by orders desc`,
      [days]
    ),
  ]);

  return json({
    range_days: days,
    stale_days: staleDays,
    kpis: kpis[0],
    daily,
    top_products: top,
    by_category: byCategory,
    dead_stock: dead,
    inventory: inventory[0],
    low_stock: low,
    by_shipping_method: byMethod,
  });
};

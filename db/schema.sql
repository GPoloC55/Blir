-- ============================================================================
-- BLir · Tienda de suéteres navideños — Esquema de base de datos
-- PostgreSQL 15+ (Neon, Supabase o Cloud SQL)
-- Ejecutar una sola vez: psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================================

create extension if not exists pgcrypto;

-- Categorías / colecciones -----------------------------------------------
create table if not exists categories (
  slug        text primary key,
  name        text not null,
  sort        int  not null default 0,
  active      boolean not null default true
);

-- Productos ---------------------------------------------------------------
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  sku_base          text not null unique,
  name              text not null,
  description       text not null default '',
  category          text not null references categories(slug),
  price_cents       int  not null check (price_cents >= 0),
  compare_at_cents  int,
  cost_cents        int  not null default 0,
  image_url         text not null default '',
  badge             text not null default '',
  active            boolean not null default true,
  sort              int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Variantes (talla / color) ----------------------------------------------
create table if not exists variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  sku         text not null unique,
  size        text not null default '',
  color       text not null default '',
  price_cents int not null check (price_cents >= 0),
  stock       int not null default 0 check (stock >= 0),
  active      boolean not null default true,
  sort        int not null default 0,
  unique (product_id, size, color)
);
create index if not exists variants_product_idx on variants(product_id);

-- Métodos de envío --------------------------------------------------------
create table if not exists shipping_methods (
  code        text primary key,
  label       text not null,
  price_cents int not null check (price_cents >= 0),
  carrier     text not null default '',
  active      boolean not null default true,
  sort        int not null default 0
);

-- Cupones ----------------------------------------------------------------
create table if not exists coupons (
  code               text primary key,
  type               text not null check (type in ('percent', 'fixed')),
  value              int not null check (value > 0),
  min_subtotal_cents int not null default 0,
  active             boolean not null default true,
  expires_at         timestamptz
);

-- Pedidos ----------------------------------------------------------------
create table if not exists orders (
  id                 text primary key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  mode               text not null default 'retail'
                       check (mode in ('retail','wholesale')),
  status             text not null default 'pending'
                       check (status in ('pending','paid','preparing','shipped','delivered','cancelled','refunded')),
  payment_status     text not null default 'unpaid'
                       check (payment_status in ('unpaid','paid','refunded','failed')),
  payment_provider   text not null default '',
  payment_id         text not null default '',
  paid_at            timestamptz,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  currency           text not null default 'MXN',
  subtotal_cents     int not null default 0,
  shipping_cents     int not null default 0,
  discount_cents     int not null default 0,
  total_cents        int not null default 0,
  coupon_code        text,
  shipping_method    text not null default 'pickup',
  shipping_address   jsonb not null default '{}'::jsonb,
  customer           jsonb not null default '{}'::jsonb,
  tracking_number    text not null default '',
  tracking_url       text not null default '',
  notes              text not null default '',
  source             text not null default 'web'
);
create index if not exists orders_created_idx on orders(created_at desc);
create index if not exists orders_status_idx on orders(status);

-- Compatibilidad con bases creadas antes de existir el modo mayoreo
alter table orders add column if not exists mode text not null default 'retail';

-- Precios de mayoreo por volumen (globales, como en el sitio original)
create table if not exists wholesale_tiers (
  min_qty     int primary key check (min_qty > 1),
  price_cents int not null check (price_cents > 0)
);

create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null references orders(id) on delete cascade,
  variant_id       uuid references variants(id) on delete set null,
  sku              text not null,
  name             text not null,
  size             text not null default '',
  color            text not null default '',
  unit_price_cents int not null,
  qty              int not null check (qty > 0),
  total_cents      int not null
);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists order_items_variant_idx on order_items(variant_id);

-- Kardex: cada movimiento de inventario queda registrado ------------------
create table if not exists inventory_movements (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  variant_id uuid not null references variants(id) on delete cascade,
  delta      int not null,
  reason     text not null check (reason in ('sale','return','purchase','adjustment','cancel')),
  order_id   text,
  note       text not null default ''
);
create index if not exists inv_mov_variant_idx on inventory_movements(variant_id, created_at desc);

-- Carritos abandonados (para recuperación con IA / email) -----------------
create table if not exists carts (
  id         text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email      text not null default '',
  phone      text not null default '',
  items      jsonb not null default '[]'::jsonb,
  total_cents int not null default 0,
  recovered  boolean not null default false,
  reminders_sent int not null default 0
);
create index if not exists carts_updated_idx on carts(updated_at desc);

-- Configuración general (clave/valor) -------------------------------------
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- ============================================================================
-- Vistas para reportes administrados por la tienda
-- ============================================================================

-- Productos estancados: inventario con stock y sin ventas en N días.
-- Se usa con: select * from dead_stock(60);
create or replace function dead_stock(days int default 60)
returns table (
  variant_id uuid, sku text, product text, size text, stock int,
  price_cents int, capital_cents int, units_sold int, last_sale timestamptz
)
language sql stable as $$
  select v.id, v.sku, p.name, v.size, v.stock, v.price_cents,
         v.stock * p.cost_cents as capital_cents,
         coalesce(s.units, 0)::int,
         s.last_sale
  from variants v
  join products p on p.id = v.product_id
  left join (
    select oi.variant_id, sum(oi.qty) as units, max(o.created_at) as last_sale
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.paid_at >= now() - (days || ' days')::interval
    group by oi.variant_id
  ) s on s.variant_id = v.id
  where v.active and v.stock > 0 and s.variant_id is null
  order by v.stock * p.cost_cents desc, v.stock desc;
$$;

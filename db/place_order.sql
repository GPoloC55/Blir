-- ============================================================================
-- place_order(payload) — crea un pedido de forma atómica.
--
-- Reglas de negocio que viven aquí (no en el navegador):
--   · Los precios salen SIEMPRE de la base, nunca del cliente.
--   · Bloquea las variantes (FOR UPDATE) y descuenta stock con validación.
--   · Si una talla no alcanza, toda la operación se revierte (sin sobreventa).
--   · Calcula subtotal, cupón, envío y total.
--   · Registra el movimiento de inventario (kardex).
--
-- payload = {
--   items: [{ variant_id, qty }],
--   customer: { name, email, phone },
--   shipping_address: { street, city, state, zip },
--   shipping_method: "pickup" | "paqueteria" | ...,
--   coupon: "BIENVENIDA",
--   notes: ""
-- }
-- ============================================================================

create or replace function place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order_id    text;
  v_item        jsonb;
  v_var         variants%rowtype;
  v_prod        products%rowtype;
  v_qty         int;
  v_subtotal    int := 0;
  v_shipping    int := 0;
  v_discount    int := 0;
  v_total       int := 0;
  v_method      text := coalesce(nullif(payload->>'shipping_method', ''), 'pickup');
  v_coupon_code text := nullif(upper(btrim(coalesce(payload->>'coupon', ''))), '');
  v_coupon      coupons%rowtype;
  v_ship        shipping_methods%rowtype;
begin
  if jsonb_typeof(payload->'items') is distinct from 'array'
     or jsonb_array_length(payload->'items') = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  v_order_id := 'BL-' || to_char(now(), 'YYMMDD') || '-' ||
                upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  insert into orders (id, customer, shipping_address, shipping_method, notes)
  values (
    v_order_id,
    coalesce(payload->'customer', '{}'::jsonb),
    coalesce(payload->'shipping_address', '{}'::jsonb),
    v_method,
    coalesce(payload->>'notes', '')
  );

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select * into v_var from variants
      where id = (v_item->>'variant_id')::uuid and active
      for update;
    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', coalesce(v_item->>'variant_id', '?');
    end if;

    select * into v_prod from products where id = v_var.product_id;

    if v_var.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%:%', v_prod.name, v_var.size;
    end if;

    update variants set stock = stock - v_qty where id = v_var.id;

    insert into order_items (order_id, variant_id, sku, name, size, color,
                             unit_price_cents, qty, total_cents)
    values (v_order_id, v_var.id, v_var.sku, v_prod.name, v_var.size, v_var.color,
            v_var.price_cents, v_qty, v_var.price_cents * v_qty);

    insert into inventory_movements (variant_id, delta, reason, order_id)
    values (v_var.id, -v_qty, 'sale', v_order_id);

    v_subtotal := v_subtotal + v_var.price_cents * v_qty;
  end loop;

  if v_coupon_code is not null then
    select * into v_coupon from coupons
      where code = v_coupon_code and active
        and (expires_at is null or expires_at > now());
    if found and v_subtotal >= v_coupon.min_subtotal_cents then
      v_discount := case
        when v_coupon.type = 'percent' then round(v_subtotal * v_coupon.value / 100.0)
        else v_coupon.value
      end;
      v_discount := least(v_discount, v_subtotal);
    else
      v_coupon_code := null;
    end if;
  end if;

  select * into v_ship from shipping_methods where code = v_method and active;
  if not found then
    select * into v_ship from shipping_methods where code = 'pickup';
    v_method := 'pickup';
  end if;
  v_shipping := coalesce(v_ship.price_cents, 0);

  v_total := greatest(0, v_subtotal + v_shipping - v_discount);

  update orders set
    subtotal_cents  = v_subtotal,
    shipping_cents  = v_shipping,
    discount_cents  = v_discount,
    total_cents     = v_total,
    coupon_code     = v_coupon_code,
    shipping_method = v_method,
    updated_at      = now()
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'subtotal_cents', v_subtotal,
    'shipping_cents', v_shipping,
    'discount_cents', v_discount,
    'total_cents', v_total,
    'shipping_method', v_method,
    'coupon_code', v_coupon_code,
    'currency', 'MXN'
  );
end;
$$;

-- Marca un pedido como pagado. Idempotente: si ya estaba pagado, no hace nada.
create or replace function mark_order_paid(p_order_id text, p_provider text default '', p_payment_id text default '')
returns orders
language plpgsql
security definer
as $$
declare
  v_order orders%rowtype;
begin
  update orders set
    payment_status   = 'paid',
    status           = case when status = 'pending' then 'paid' else status end,
    payment_provider = coalesce(nullif(p_provider, ''), payment_provider),
    payment_id       = coalesce(nullif(p_payment_id, ''), payment_id),
    paid_at          = coalesce(paid_at, now()),
    updated_at       = now()
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'ORDER_NOT_FOUND:%', p_order_id;
  end if;

  return v_order;
end;
$$;

-- Cancela un pedido y devuelve el stock al inventario (idempotente).
create or replace function cancel_order(p_order_id text, p_reason text default '')
returns orders
language plpgsql
security definer
as $$
declare
  v_order orders%rowtype;
  v_item  order_items%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND:%', p_order_id;
  end if;
  if v_order.status = 'cancelled' then
    return v_order;
  end if;

  for v_item in select * from order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update variants set stock = stock + v_item.qty where id = v_item.variant_id;
      insert into inventory_movements (variant_id, delta, reason, order_id, note)
      values (v_item.variant_id, v_item.qty, 'cancel', p_order_id, p_reason);
    end if;
  end loop;

  update orders set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

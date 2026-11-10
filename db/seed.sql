-- ============================================================================
-- BLir · Datos iniciales (idempotente: se puede correr varias veces)
-- psql "$DATABASE_URL" -f db/seed.sql
--
-- Catálogo basado en "BLir · Suéteres navideños 2026" (16 diseños).
-- Precio retail $499 · mayoreo desde 6 piezas ($349 → $329 → $299).
-- ============================================================================

insert into categories (slug, name, sort) values
  ('nuevo',      'Lo nuevo',   1),
  ('clasicos',   'Clásicos',   2),
  ('personajes', 'Personajes', 3)
on conflict (slug) do nothing;

insert into products (slug, sku_base, name, description, category,
                      price_cents, compare_at_cents, cost_cents, image_url, badge, sort)
values
  ('lo-nuevo',     'BLIR-LONUEVO',  'Lo nuevo',      'El diseño de la temporada: tejido grueso y estampado en punto.',              'nuevo',      49900, null, 22000, '/img/lo-nuevo.jpg',     'Nuevo',  1),
  ('pinos',        'BLIR-PINOS',    'Pinos',         'Pinos nevados en un suéter clásico de Navidad.',                              'clasicos',   49900, null, 22000, '/img/pinos.jpg',        '',       2),
  ('clasicos',     'BLIR-CLASICOS', 'Clásicos',      'Los diseños de siempre: renos, copos y árboles.',                             'clasicos',   49900, null, 22000, '/img/clasicos.jpg',     '',       3),
  ('noche-buena',  'BLIR-NOCHEBUENA','Noche Buena',  'Flor de Nochebuena tejida con detalles en rojo y verde.',                     'clasicos',   49900, null, 22000, '/img/noche-buena.jpg',  'Favorito', 4),
  ('mickey',       'BLIR-MICKEY',   'Mickey',        'Mickey Mouse en versión navideña.',                                            'personajes', 49900, null, 22000, '/img/mickey.jpg',       '',       5),
  ('star-wars',    'BLIR-STARWARS', 'Star Wars',     'Darth Vader y stormtroopers con gorro de Santa.',                             'personajes', 49900, null, 22000, '/img/star-wars.jpg',    'Top',    6),
  ('harry-potter', 'BLIR-HP',       'Harry Potter',  'Hogwarts y copos de nieve.',                                                  'personajes', 49900, null, 22000, '/img/harry-potter.jpg', '',       7),
  ('spider-man',   'BLIR-SPIDER',   'Spider',        'Spider-Man entre esferas navideñas.',                                         'personajes', 49900, null, 22000, '/img/spider-man.jpg',   '',       8),
  ('goofy',        'BLIR-GOOFY',    'Goofy',         'Goofy con gorro de Santa y bufanda a cuadros.',                               'personajes', 49900, null, 22000, '/img/goofy.jpg',        '',       9),
  ('snoopy',       'BLIR-SNOOPY',   'Snoopy',        'Snoopy y Woodstock decorando el árbol.',                                      'personajes', 49900, null, 22000, '/img/snoopy.jpg',       '',      10),
  ('copos',        'BLIR-COPAS',    'Copos',         'Copos de nieve en relieve sobre fondo azul marino.',                          'clasicos',   49900, null, 22000, '/img/copos.jpg',        '',      11),
  ('snowman',      'BLIR-SNOWMAN',  'Snowman',       'Muñeco de nieve con bufanda, tejido jacquard.',                               'clasicos',   49900, null, 22000, '/img/snowman.jpg',      '',      12),
  ('santa',        'BLIR-SANTA',    'Santa',         'Papá Noel completo, con saco y botas.',                                       'clasicos',   49900, null, 22000, '/img/santa.jpg',        '',      13),
  ('reno',         'BLIR-RENO',     'Reno',          'Reno de frente con astas y nariz roja.',                                      'clasicos',   49900, null, 22000, '/img/reno.jpg',         '',      14),
  ('grinch',       'BLIR-GRINCH',   'Grinch',        'El Grinch con su traje de Santa, verde y rojo.',                              'personajes', 49900, null, 22000, '/img/grinch.jpg',       'Trend', 15),
  ('personajes',   'BLIR-PERSONAJES','Personajes',   'Colage de personajes navideños en tejido jacquard.',                          'personajes', 49900, null, 22000, '/img/personajes.jpg',   '',      16)
on conflict (slug) do nothing;

-- Tallas S–XL con stock inicial de arranque (ajustar con inventario real)
insert into variants (product_id, sku, size, price_cents, stock, sort)
select p.id, p.sku_base || '-' || s.size, s.size, p.price_cents, s.stock, s.sort
from products p
cross join (values
  ('S',  12, 1),
  ('M',  20, 2),
  ('L',  20, 3),
  ('XL', 12, 4)
) as s(size, stock, sort)
where p.sku_base like 'BLIR-%'
on conflict (sku) do nothing;

-- Mayoreo: el precio se aplica a TODAS las piezas según el total del carrito
insert into wholesale_tiers (min_qty, price_cents) values
  (24, 29900),
  (12, 32900),
  (6,  34900)
on conflict (min_qty) do update set price_cents = excluded.price_cents;

-- Envíos
insert into shipping_methods (code, label, price_cents, carrier, sort) values
  ('pickup',     'Recoger en tienda (CDMX)', 0,     '',        1),
  ('local',      'Entrega local CDMX',       7900,  'Local',   2),
  ('paqueteria', 'Paquetería nacional',      14900, 'Skydropx', 3),
  ('quote',      'Cotización (mayoreo)',     0,     '',        4)
on conflict (code) do nothing;

-- Cupones
insert into coupons (code, type, value, min_subtotal_cents) values
  ('BIENVENIDA', 'percent', 10, 0),
  ('NAVIDAD26',  'percent', 15, 120000)
on conflict (code) do nothing;

-- Configuración
insert into settings (key, value) values
  ('store', '{"name":"BLir","legal_name":"Cim Textiles","email":"hola@blir.mx","phone":"","currency":"MXN","origin_zip":"01000"}'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- BLir · Datos iniciales (idempotente: se puede correr varias veces)
-- psql "$DATABASE_URL" -f db/seed.sql
-- ============================================================================

insert into categories (slug, name, sort) values
  ('nuevo',      'Lo nuevo',   1),
  ('clasicos',   'Clásicos',   2),
  ('licencias',  'Licencias',  3),
  ('personajes', 'Personajes', 4)
on conflict (slug) do nothing;

-- Catálogo 2026 (basado en el PDF "Ugly Catalogo 2026 v1")
insert into products (slug, sku_base, name, description, category,
                      price_cents, compare_at_cents, cost_cents, badge, sort)
values
  ('lo-nuevo',      'BLIR-LONUEVO',  'Lo nuevo 2026',    'El diseño de la temporada: tejido grueso, cuello alto y estampado en punto.', 'nuevo',      64900, 79900, 32000, 'Nuevo',    1),
  ('pinos',         'BLIR-PINOS',    'Pinos',            'Pinos nevados y renos en un suéter clásico de Navidad.',                      'clasicos',   59900, 74900, 29000, '',         2),
  ('noche-buena',   'BLIR-NOCHEBUENA','Noche Buena',     'Flor de Nochebuena tejida con detalles en rojo y verde.',                      'clasicos',   59900, 74900, 29000, 'Favorito', 3),
  ('mickey',        'BLIR-MICKEY',   'Mickey',           'Mickey Mouse en versión navideña. Licencia oficial.',                         'licencias',  69900, 84900, 35000, '',         4),
  ('star-wars',     'BLIR-STARWARS', 'Star Wars',        'Darth Vader, stormtroopers y sables de luz con gorro de Santa.',              'licencias',  69900, 84900, 35000, 'Top',      5),
  ('harry-potter',  'BLIR-HP',       'Harry Potter',     'Hogwarts, escudo de Gryffindor y copos de nieve.',                            'licencias',  69900, 84900, 35000, '',         6),
  ('spider-man',    'BLIR-SPIDER',   'Spider-Man',       'Spider-Man columpiándose entre esferas navideñas.',                           'licencias',  69900, 84900, 35000, '',         7),
  ('goofy',         'BLIR-GOOFY',    'Goofy',            'Goofy con gorro de Santa y bufanda a cuadros.',                               'licencias',  69900, 84900, 35000, '',         8),
  ('snoopy',        'BLIR-SNOOPY',   'Snoopy',           'Snoopy y Woodstock decorando el árbol.',                                      'licencias',  64900, 79900, 32000, '',         9),
  ('copos',         'BLIR-COPAS',    'Copos',            'Copos de nieve en relieve sobre fondo azul marino.',                          'clasicos',   54900, 69900, 27000, '',        10),
  ('snowman',       'BLIR-SNOWMAN',  'Snowman',          'Muñeco de nieve con bufanda, tejido jacquard.',                               'clasicos',   54900, 69900, 27000, '',        11),
  ('santa',         'BLIR-SANTA',    'Santa',            'Papá Noel completo, con saco y botas.',                                      'clasicos',   59900, 74900, 29000, '',        12),
  ('reno',          'BLIR-RENO',     'Reno',             'Reno de frente con astas y nariz roja.',                                      'clasicos',   59900, 74900, 29000, '',        13),
  ('grinch',        'BLIR-GRINCH',   'Grinch',           'El Grinch con su traje de Santa, verde y rojo.',                              'personajes', 64900, 79900, 32000, 'Trend',   14),
  ('personajes',    'BLIR-PERSONAJES','Personajes',      'Colage de personajes navideños en tejido jacquard.',                          'personajes', 64900, 79900, 32000, '',        15)
on conflict (slug) do nothing;

-- Variantes: tallas S–XL con stock inicial de arranque
insert into variants (product_id, sku, size, price_cents, stock, sort)
select p.id, p.sku_base || '-' || s.size, s.size, p.price_cents, s.stock, s.sort
from products p
cross join (values
  ('S',  6, 1),
  ('M', 12, 2),
  ('L', 12, 3),
  ('XL', 6, 4)
) as s(size, stock, sort)
where p.sku_base like 'BLIR-%'
on conflict (sku) do nothing;

-- Envíos
insert into shipping_methods (code, label, price_cents, carrier, sort) values
  ('pickup',     'Recoger en tienda (CDMX)', 0,      '',          1),
  ('local',      'Entrega local CDMX',       7900,   'Local',     2),
  ('paqueteria', 'Paquetería nacional',      14900,  'Skydropx',  3)
on conflict (code) do nothing;

-- Cupones
insert into coupons (code, type, value, min_subtotal_cents) values
  ('BIENVENIDA', 'percent', 10, 0),
  ('NAVIDAD26',  'percent', 15, 120000)
on conflict (code) do nothing;

-- Configuración
insert into settings (key, value) values
  ('store', '{"name":"BLir","legal_name":"Cim Textiles","email":"hola@blir.mx","phone":"","currency":"MXN","free_shipping_from_cents":149900,"origin_zip":"01000"}'::jsonb)
on conflict (key) do nothing;

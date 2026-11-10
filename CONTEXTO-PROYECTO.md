# BLir — Contexto del proyecto

Tienda en línea de **suéteres navideños** (Cim Textiles). Edición 2026.

> Este repositorio puede hacerse público. **No contiene secretos.** Las
> credenciales viven solo en Netlify (Environment variables).

---

## 1. Qué es y qué no es

**Es** un e-commerce propio: catálogo con inventario real, checkout con pasarela,
envíos, panel de administración y reportes de ventas y productos estancados.

**No es** Shopify. No hay renta mensual de plataforma, no hay tema propietario y
no se depende de sus apps. El código y los datos son del negocio.

Réplica del patrón de **Botanita Bonita** (sitio estático + Netlify Functions +
panel `/admin`), con una diferencia deliberada: **PostgreSQL** en lugar de blobs
clave-valor. Inventario, pedidos y reportes necesitan transacciones y SQL.

---

## 2. Stack

| Capa | Elección | Nota |
|---|---|---|
| Frontend | HTML/CSS/JS estático | Sin build, publica directo |
| API | Netlify Functions v2 (`.mjs`) | Igual que Botanita |
| Datos | PostgreSQL | Neon gratis hoy; migrable a Cloud SQL |
| Pagos | Mercado Pago Checkout Pro | Tarjeta, OXXO, SPEI, MSI |
| Envíos | Tarifas planas hoy; Skydropx fase 2 | Cotización y guías |
| Admin | Panel propio en `/admin` | Cookie HMAC `blir_admin` |
| IA | WhatsApp + carrito abandonado | Fase 3 |

### ¿Por qué Mercado Pago y no Clip?

Clip es excelente en terminal punto de venta, pero su checkout en línea es menos
maduro (aprobación, documentación y soporte). Mercado Pago es el estándar de
e-commerce en México y resuelve OXXO y SPEI, que son críticos para esta
temporada. La integración quedó aislada en `netlify/lib/payments.mjs`, así que
cambiar a Clip o Stripe es reemplazar ese archivo, no el checkout.

### ¿Por qué PostgreSQL y no Netlify Blobs?

| Necesidad | Blobs | PostgreSQL |
|---|---|---|
| Descontar stock sin sobreventa | ❌ condiciones de carrera | ✅ `FOR UPDATE` |
| Reportes (ventas, estancados, márgenes) | ❌ cargar todo en memoria | ✅ SQL |
| Historial de pedidos confiable | ⚠️ un JSON que se reescribe | ✅ filas + kardex |
| Costo | $0 | $0 en Neon (plan gratis) |

---

## 3. Estructura

```
blir/
├── db/
│   ├── schema.sql          Tablas, índices, función dead_stock()
│   ├── place_order.sql     place_order() / mark_order_paid() / cancel_order()
│   └── seed.sql            16 modelos, tallas S–XL, mayoreo, envíos y cupones
├── netlify/
│   ├── lib/
│   │   ├── db.mjs          Cliente PostgreSQL (Neon serverless)
│   │   ├── common.mjs      JSON + cookie HMAC del admin
│   │   └── payments.mjs    Mercado Pago (preferencia + consulta de pago)
│   └── functions/
│       ├── auth.mjs                 Login/logout admin
│       ├── shop.mjs                 Catálogo público en una sola llamada
│       ├── products.mjs             Catálogo + CRUD admin
│       ├── orders.mjs               Crear pedido, listar, cambiar estado
│       ├── checkout.mjs             Pedido + preferencia de pago
│       ├── webhook-mercadopago.mjs  Confirmación de pago (idempotente)
│       ├── inventory.mjs            Ajustes y kardex
│       └── reports.mjs              KPIs, ventas, estancados, stock crítico
├── public/
│   ├── index.html                   Tienda (diseño original del cliente)
│   ├── success.html                 Página de gracias / pago pendiente
│   ├── admin.html                   Panel /admin
│   ├── img/                         16 fotos de producto (jpg)
│   └── assets/ (blir.css, store.js, styles.css, admin.js)
└── scripts/setup-db.mjs    Aplica el SQL sin necesitar psql
```

El diseño es el del cliente: se extrajo su CSS a `blir.css` y sus fotos base64
a `public/img/`. `store.js` reemplaza el carrito de WhatsApp por catálogo con
stock real y checkout con pasarela, conservando la misma identidad visual.

---

## 4. Endpoints

Prefijo público `/api/…` → `/.netlify/functions/:splat`.

| Endpoint | Métodos | Acceso |
|---|---|---|
| `/api/auth` | POST, GET, DELETE | Login |
| `/api/shop` | GET | Público (catálogo, stock, mayoreo, envíos) |
| `/api/products` | GET; POST, DELETE | Público / admin |
| `/api/orders` | POST; GET, PUT | Público / admin |
| `/api/checkout` | POST | Público |
| `/api/webhook-mercadopago` | POST | Mercado Pago |
| `/api/inventory` | GET, POST | Admin |
| `/api/reports` | GET `?days=30&stale=60` | Admin |

---

## 5. Modelo de datos

- `products` — nombre, slug, SKU base, categoría, precio, costo, imagen, badge.
- `variants` — talla/color, SKU único, precio, **stock**.
- `orders` — estados `pending → paid → preparing → shipped → delivered`
  (más `cancelled` y `refunded`), totales en centavos, dirección, guía,
  `mode` (`retail` o `wholesale`).
- `order_items` — copia del precio al momento de la venta (nunca se recalcula).
- `inventory_movements` — kardex: venta, compra, ajuste, devolución, cancelación.
- `wholesale_tiers` — precio por pieza según el total de piezas del pedido.
- `coupons`, `shipping_methods`, `carts`, `settings`.

**Dinero siempre en centavos enteros** (`59900` = $599.00). Evita errores de
punto flotante.

### Reglas que no viven en el navegador

1. Los precios salen de la base; el cliente solo manda `variant_id` y `qty`.
2. `place_order()` bloquea la variante y descuenta stock; si no alcanza, revierte
   **todo** el pedido. Probado: intentar comprar 999 piezas deja stock intacto.
3. Cancelar devuelve el stock y registra el movimiento (idempotente). Un
   reembolso o contracargo del webhook también devuelve el inventario.
4. El webhook de pago es idempotente: `mark_order_paid()` no duplica nada.
5. **Mayoreo**: el precio por pieza depende del total del pedido (6+ $349,
   12+ $329, 24+ $299) y se aplica a todas las piezas. Si no llega al mínimo,
   la base rechaza el pedido con `WHOLESALE_MIN:6`. El envío de mayoreo se
   fuerza a `quote` y los cupones no aplican.
6. Los cupones solo aplican a venta al público y se validan en la base.

---

## 6. Catálogo inicial

Tomado del HTML *BLir · Suéteres navideños 2026* (16 diseños):

Lo nuevo · Pinos · Clásicos · Noche Buena · Mickey · Star Wars · Harry Potter ·
Spider · Goofy · Snoopy · Copos · Snowman · Santa · Reno · Grinch · Personajes.

Cada modelo con tallas S/M/L/XL. Precio público **$499**; mayoreo 6+ $349,
12+ $329, 24+ $299. Categorías: Lo nuevo, Clásicos, Personajes.

Los valores de arranque (stock por talla, costo $220, fotos) son provisionales:
se ajustan desde `/admin` o con `db/seed.sql` cuando el cliente confirme.

---

## 7. Configuración

Variables en Netlify → Site configuration → Environment variables:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | sí | Conexión PostgreSQL |
| `ADMIN_PASSWORD` | sí | Acceso a `/admin` |
| `AUTH_SECRET` | sí | Firma de cookie (`openssl rand -base64 32`) |
| `MP_ACCESS_TOKEN` | para cobrar | Mercado Pago |
| `MP_WEBHOOK_SECRET` | recomendada | Verificar firma de webhooks |
| `SKYDROPX_CLIENT_ID` / `_SECRET` | fase 2 | Cotizar y generar guías |

Sin `MP_ACCESS_TOKEN` el checkout funciona en **modo sandbox**: crea el pedido y
no cobra. Sirve para probar toda la operación antes de abrir la pasarela.

### Deploy

1. Repo en GitHub → Netlify → *Add new site* → *Import from Git*.
2. Base directory: raíz. Publish: `public`. Functions: `netlify/functions`.
3. Cargar variables de entorno.
4. `npm run db:setup` una vez contra la base de producción.
5. Deploy. Netlify reconstruye en cada push a `main`.

### Estado del deploy (10 nov 2026)

- **Tienda**: https://blir-sueteres.netlify.app
- **Admin**: https://blir-sueteres.netlify.app/admin (usuario único; contraseña en
  `.env` → `ADMIN_PASSWORD`).
- **Base**: Neon, PostgreSQL 18, región `us-east-2`.
- **Variables cargadas en Netlify**: `DATABASE_URL`, `ADMIN_PASSWORD`,
  `AUTH_SECRET` (secretos, contextos production/deploy-preview/branch-deploy).
- **Deploy manual** (mientras no esté autorizada la GitHub App):

  ```
  npx netlify-cli deploy --prod --dir=public --functions=netlify/functions \
    --site=7455eba4-a985-4ff7-94c5-4a81318b0e25
  ```

- **Auto-deploy**: pendiente. En Netlify: *Project configuration → Build & deploy
  → Repository → Link repository* y autorizar la GitHub App para `GPoloC55/Blir`.
- **Pagos**: sin `MP_ACCESS_TOKEN` la tienda muestra un aviso de modo de prueba y
  el checkout crea el pedido sin cobrar. Al cargar las credenciales se quita solo.

### Checklist para abrir la tienda (temporada 2026)

Corte de paquetería: ~15–18 de diciembre. Trabajar hacia atrás:

1. Crear proyecto en Neon → copiar `DATABASE_URL` (con `?sslmode=require`).
2. `npm run db:setup` (aplica esquema, funciones y datos iniciales).
3. Crear sitio en Netlify desde GitHub y cargar las 3 variables base.
4. Abrir `/admin`, entrar con `ADMIN_PASSWORD` y capturar stock real.
5. Probar una compra en sandbox (sin `MP_ACCESS_TOKEN`): debe crear pedido,
   descontar stock y llevar a `/gracias?…&sandbox=1`.
6. Activar Mercado Pago: `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET`; comprar con
   tarjeta real de bajo monto y verificar que el pedido pase a `paid`.
7. Confirmar número de WhatsApp y dominio; ajustar `settings.store`.
8. Prueba móvil real (iOS y Android) y una guía de paquetería de punta a punta.

### Probar sin base de datos

El frontend se puede revisar con cualquier servidor estático, pero `/api/shop`
debe responder. Para pruebas de UI se usó un mock de `/api/shop`, `/api/orders`
y `/api/checkout` con los datos de `seed.sql`; no forma parte del repo.

`@neondatabase/serverless` habla por HTTP, así que las Functions no pueden
conectarse a un Postgres local en Docker. Para desarrollo se recomienda una
rama de Neon (gratis) o el mock.

---

## 8. Roadmap

| Fase | Alcance | Estado |
|---|---|---|
| **0. Base** | Esquema, API, admin, checkout sandbox, reportes | ✅ hecho |
| **1. Diseño** | Integrar el HTML del cliente, fotos, catálogo dinámico | ✅ hecho |
| **2. Cobro real** | Cuenta Mercado Pago, webhook, pruebas en producción | ⏳ depende de credenciales |
| **3. Operación** | Skydropx, guías, tracking, correos, cupones | ⏳ |
| **4. Contenido** | Precios, costos y stock reales, SEO, analytics | ⏳ |
| **5. IA** | WhatsApp, carrito abandonado, recomendaciones | ⏳ |

### IA: por orden de retorno

1. **WhatsApp**: tallas, disponibilidad, estado de pedido. Es el canal real en México.
2. **Carrito abandonado**: email/WhatsApp con mensaje generado y timing.
3. **Recomendaciones**: “completa el look” por co-ocurrencia de compra.
4. **Pronóstico de temporada**: qué reponer y qué liquidar antes de diciembre.
5. **Copy y SEO** de producto, con revisión humana.

Regla: la IA **no** cambia precios ni descuenta sola. Todo pasa por aprobación
humana y se mide lift incremental.

---

## 9. Pendientes y decisiones abiertas

- [x] **Diseño original**: integrado (CSS, fotos y estructura del HTML del cliente).
- [ ] **Pasarela**: confirmar si se usa Mercado Pago (recomendado) o Clip.
- [ ] **Envíos**: ¿Skydropx, paquetería directa o entrega local?
- [ ] **Catálogo**: precios, costos, stock real y fotos definitivas.
- [ ] **WhatsApp**: número real del negocio (hoy vacío en `settings.store.phone`).
- [ ] **Facturación**: CFDI 4.0 (Facturama) en fase 2.
- [ ] **Dominio**: definir (ej. `blir.mx`) y apuntar a Netlify.
- [ ] **Correos**: confirmación de pedido y guía (Resend o similar).

## 10. Seguridad

- Cookie `blir_admin` HttpOnly, Secure, SameSite=Lax, firmada con HMAC-SHA256.
- En producción el login se niega a funcionar si faltan `AUTH_SECRET` o
  `ADMIN_PASSWORD` (no se usan credenciales de demo).
- El admin nunca expone `DATABASE_URL` al navegador.
- Los precios y el stock se validan en el servidor, no en el cliente.
- Webhooks verificados por firma y por consulta directa a la API de pagos.
- Nunca subir `.env` ni credenciales al repositorio.

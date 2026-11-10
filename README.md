# BLir — Tienda de suéteres navideños

E-commerce propio, **sin Shopify y sin renta mensual de plataforma**.
Mismo patrón que Botanita Bonita, con una mejora clave: **PostgreSQL** en lugar
de almacenamiento clave-valor, porque aquí sí hay inventario, pedidos y reportes.

- **Frontend:** HTML/CSS/JS estático (sin build).
- **API:** Netlify Functions v2 (`.mjs`).
- **Base de datos:** PostgreSQL (Neon gratis hoy, Cloud SQL mañana).
- **Pagos:** Mercado Pago Checkout Pro (tarjeta, OXXO, SPEI, MSI).
- **Envíos:** Skydropx (fase 2) con tarifas planas como respaldo.
- **Panel:** `/admin` con pedidos, productos, inventario y reportes.

## Arranque rápido

```bash
# 1. Dependencias
npm install

# 2. Base de datos (crea el proyecto gratis en https://neon.tech)
export DATABASE_URL="postgres://usuario:clave@host/db?sslmode=require"
npm run db:setup          # schema + funciones + catálogo inicial

# 3. Probar en local
npx netlify dev           # http://localhost:8888
```

Variables de entorno (Netlify → Site configuration → Environment variables):

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (obligatoria) |
| `ADMIN_PASSWORD` | Contraseña de `/admin` |
| `AUTH_SECRET` | Firma de la cookie de sesión (aleatorio) |
| `MP_ACCESS_TOKEN` | Mercado Pago (si falta, checkout en modo sandbox) |
| `MP_WEBHOOK_SECRET` | Verificación de firma de webhooks |
| `SKYDROPX_CLIENT_ID` / `_SECRET` | Cotización y guías (fase 2) |

Genera `AUTH_SECRET` con:

```bash
openssl rand -base64 32
```

## Estructura

```
blir/
├── db/
│   ├── schema.sql          Tablas, índices y vista de productos estancados
│   ├── place_order.sql     place_order() / cancel_order() / mark_order_paid()
│   └── seed.sql            Catálogo 2026, envíos y cupones
├── netlify/
│   ├── lib/
│   │   ├── db.mjs          Cliente PostgreSQL
│   │   ├── common.mjs      JSON + cookie HMAC del admin
│   │   └── payments.mjs    Mercado Pago
│   └── functions/
│       ├── auth.mjs
│       ├── products.mjs
│       ├── orders.mjs
│       ├── checkout.mjs
│       ├── webhook-mercadopago.mjs
│       ├── inventory.mjs
│       └── reports.mjs
├── public/
│   ├── index.html          Tienda
│   ├── checkout.html       Checkout
│   ├── success.html        Confirmación
│   ├── admin.html          Panel
│   └── assets/
└── scripts/setup-db.mjs    Aplica el SQL sin necesitar psql
```

## Reglas de negocio (viven en la base, no en el navegador)

- Los **precios salen siempre de la base**. El cliente solo manda `variant_id` y `qty`.
- `place_order()` bloquea la variante (`FOR UPDATE`) y **descuenta stock**; si no
  alcanza, revierte todo el pedido. No hay sobreventa.
- Cada movimiento queda en `inventory_movements` (kardex auditable).
- Cancelar un pedido devuelve el stock automáticamente (`cancel_order()`).
- Los webhooks de pago son **idempotentes** (`mark_order_paid()`).

## Despliegue

1. Crear repo en GitHub y conectarlo a Netlify.
2. Base directory: raíz del repo · Publish: `public` · Functions: `netlify/functions`.
3. Configurar las variables de entorno.
4. Correr `npm run db:setup` una sola vez contra la base de producción.
5. Deploy.

## Pendientes conocidos

- Fotos reales del catálogo (hoy hay placeholders).
- Credenciales de Mercado Pago (o Clip) para cobrar de verdad.
- Integración Skydropx para cotizar y generar guías.
- Automatización con IA: WhatsApp, carrito abandonado, recomendaciones.

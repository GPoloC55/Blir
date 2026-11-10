const MP_API = "https://api.mercadopago.com";

export function mpConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

/**
 * Crea una preferencia de Checkout Pro. El comprador paga en el dominio de
 * Mercado Pago: la tienda nunca ve datos de tarjeta (sin alcance PCI).
 */
export async function createPreference({ order, items, baseUrl }) {
  if (!mpConfigured()) return null;

  const preference = {
    // Una sola línea con el total exacto del pedido (incluye envío y cupón).
    // Evita desajustes de centavos entre la tienda y Mercado Pago.
    items: [
      {
        id: order.id,
        title: `BLir — Pedido ${order.id}`,
        description: items
          .map((it) => `${it.qty}× ${it.name}${it.size ? ` (${it.size})` : ""}`)
          .join(", ")
          .slice(0, 250),
        quantity: 1,
        currency_id: "MXN",
        unit_price: order.total_cents / 100,
      },
    ],
    payer: {
      name: order.customer?.name || "",
      email: order.customer?.email || "",
      phone: { number: order.customer?.phone || "" },
    },
    external_reference: order.id,
    statement_descriptor: "BLIR",
    notification_url: `${baseUrl}/api/webhook-mercadopago`,
    back_urls: {
      success: `${baseUrl}/gracias?order=${order.id}`,
      pending: `${baseUrl}/gracias?order=${order.id}&pending=1`,
      failure: `${baseUrl}/gracias?order=${order.id}&failure=1`,
    },
    auto_return: "approved",
    binary_mode: false,
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pref-${order.id}`,
    },
    body: JSON.stringify(preference),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Mercado Pago ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  };
}

export async function getPayment(paymentId) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}`);
  return res.json();
}

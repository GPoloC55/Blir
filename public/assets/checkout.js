/* BLir · Checkout */
const CART_KEY = "blir_cart_v1";
const money = (c) => (c / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const $ = (s) => document.querySelector(s);

const SHIPPING = { pickup: 0, local: 7900, paqueteria: 14900 };

const cart = (() => {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
})();

if (!cart.length) {
  location.replace("/");
}

function subtotal() {
  return cart.reduce((s, l) => s + l.price_cents * l.qty, 0);
}

function renderSummary() {
  const method = $("#method").value;
  const ship = SHIPPING[method] ?? 0;
  $("#summary").innerHTML = `
    ${cart.map((l) => `
      <div class="line">
        <div>
          <h4>${l.name}</h4>
          <small>Talla ${l.size} × ${l.qty}</small>
        </div>
        <div class="line-total">${money(l.price_cents * l.qty)}</div>
      </div>`).join("")}
    <div class="totals" style="margin-top:16px"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    <div class="totals"><span>Envío</span><span>${ship ? money(ship) : "Gratis"}</span></div>
    <div class="totals grand"><span>Total</span><span>${money(subtotal() + ship)}</span></div>`;
}

function syncAddress() {
  const method = $("#method").value;
  const needAddress = method !== "pickup";
  $("#addressFields").style.display = needAddress ? "" : "none";
  for (const id of ["street", "city", "state", "zip"]) {
    $("#" + id).required = needAddress;
  }
  renderSummary();
}

$("#method").addEventListener("change", syncAddress);
syncAddress();

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#payBtn");
  const err = $("#error");
  err.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Creando pedido…";

  const method = $("#method").value;
  const payload = {
    items: cart.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
    customer: {
      name: $("#name").value.trim(),
      email: $("#email").value.trim(),
      phone: $("#phone").value.trim(),
    },
    shipping_method: method,
    shipping_address:
      method === "pickup"
        ? {}
        : {
            street: $("#street").value.trim(),
            city: $("#city").value.trim(),
            state: $("#state").value.trim(),
            zip: $("#zip").value.trim(),
            references: $("#notes").value.trim(),
          },
    coupon: $("#coupon").value.trim().toUpperCase(),
    notes: $("#notes").value.trim(),
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo procesar el pago.");

    localStorage.removeItem(CART_KEY);
    if (data.init_point) {
      location.href = data.init_point;
    } else {
      location.href = data.redirect || `/gracias?order=${data.order_id}`;
    }
  } catch (ex) {
    err.textContent = ex.message;
    err.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Pagar y confirmar pedido";
  }
});

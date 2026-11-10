/* BLir · Tienda — carrito y catálogo */

const CART_KEY = "blir_cart_v1";
const $ = (sel) => document.querySelector(sel);

const money = (cents) =>
  (cents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const state = {
  products: [],
  category: "all",
  selected: {}, // productId -> size
  cart: loadCart(),
};

/* Carrito ----------------------------------------------------------------- */
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCart();
}
function addToCart(product, variant) {
  if (!variant || variant.stock <= 0) return;
  const existing = state.cart.find((l) => l.variant_id === variant.id);
  if (existing) {
    if (existing.qty + 1 > variant.stock) return flash("No hay más piezas disponibles de esa talla.");
    existing.qty += 1;
  } else {
    state.cart.push({
      variant_id: variant.id,
      product_id: product.id,
      name: product.name,
      size: variant.size,
      price_cents: variant.price_cents,
      image_url: product.image_url,
      stock: variant.stock,
      qty: 1,
    });
  }
  saveCart();
  openCart();
}
function setQty(variantId, delta) {
  const line = state.cart.find((l) => l.variant_id === variantId);
  if (!line) return;
  const next = line.qty + delta;
  if (next <= 0) {
    state.cart = state.cart.filter((l) => l.variant_id !== variantId);
  } else if (next > line.stock) {
    return flash(`Solo quedan ${line.stock} piezas en talla ${line.size}.`);
  } else {
    line.qty = next;
  }
  saveCart();
}
function cartTotal() {
  return state.cart.reduce((s, l) => s + l.price_cents * l.qty, 0);
}
function cartCount() {
  return state.cart.reduce((s, l) => s + l.qty, 0);
}

/* Render ------------------------------------------------------------------ */
function renderFilters() {
  const cats = [
    ["all", "Todo"],
    ...new Map(state.products.map((p) => [p.category, p.category])).entries(),
  ].map(([slug]) => [slug, slug]);
  const names = { all: "Todo", nuevo: "Lo nuevo", clasicos: "Clásicos", licencias: "Licencias", personajes: "Personajes" };
  $("#filters").innerHTML = cats
    .map(
      ([slug]) =>
        `<button class="chip ${state.category === slug ? "active" : ""}" data-cat="${slug}">${names[slug] || slug}</button>`
    )
    .join("");
}

function renderCatalog() {
  const list = state.products.filter((p) => state.category === "all" || p.category === state.category);
  $("#catalogCount").textContent = `${list.length} modelos · tallas S a XL`;

  $("#grid").innerHTML = list
    .map((p) => {
      const variants = p.variants || [];
      const chosen = variants.find((v) => v.id === state.selected[p.id]) || variants.find((v) => v.stock > 0) || variants[0];
      const soldOut = variants.every((v) => v.stock <= 0);
      return `
      <article class="card">
        <div class="card-media">
          ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
          ${p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy">`
            : `<div class="fallback">${p.name}<br><small>Foto próximamente</small></div>`}
        </div>
        <div class="card-body">
          <h3>${p.name}</h3>
          <p class="desc">${p.description || ""}</p>
          <div class="price">
            <b>${money(p.price_cents)}</b>
            ${p.compare_at_cents ? `<s>${money(p.compare_at_cents)}</s>` : ""}
          </div>
          <div class="sizes">
            ${variants
              .map(
                (v) => `<button class="size ${chosen && chosen.id === v.id ? "active" : ""}"
                  data-product="${p.id}" data-variant="${v.id}" ${v.stock <= 0 ? "disabled" : ""}
                  title="${v.stock <= 0 ? "Agotado" : `${v.stock} disponibles`}">${v.size}</button>`
              )
              .join("")}
          </div>
          <button class="btn block" data-add="${p.id}"
            ${soldOut || !chosen ? "disabled" : ""}>
            ${soldOut ? "Agotado" : "Agregar al carrito"}
          </button>
        </div>
      </article>`;
    })
    .join("");
}

function renderCart() {
  $("#cartCount").textContent = cartCount();
  const body = $("#cartBody");
  if (!state.cart.length) {
    body.innerHTML = `<div class="empty">Tu carrito está vacío.<br>Elige un suéter para empezar.</div>`;
    $("#cartFoot").innerHTML = "";
    return;
  }
  body.innerHTML = state.cart
    .map(
      (l) => `
      <div class="line">
        <div class="line-img">${l.image_url ? `<img src="${l.image_url}" alt="">` : "🧶"}</div>
        <div>
          <h4>${l.name}</h4>
          <small>Talla ${l.size} · ${money(l.price_cents)}</small>
          <div class="qty">
            <button data-qty="${l.variant_id}" data-delta="-1">−</button>
            <span>${l.qty}</span>
            <button data-qty="${l.variant_id}" data-delta="1">+</button>
          </div>
        </div>
        <div class="line-total">${money(l.price_cents * l.qty)}</div>
      </div>`
    )
    .join("");

  $("#cartFoot").innerHTML = `
    <div class="totals"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
    <div class="totals"><span>Envío</span><span>Se calcula en el checkout</span></div>
    <div class="totals grand"><span>Total</span><span>${money(cartTotal())}</span></div>
    <a class="btn block" href="/checkout">Continuar con el pago</a>
    <p class="hint" style="text-align:center;margin:10px 0 0">Pago seguro con Mercado Pago · Tarjeta, OXXO y SPEI</p>`;
}

/* Interacción ------------------------------------------------------------- */
function openCart() {
  $("#drawer").classList.add("open");
  $("#scrim").classList.add("open");
}
function closeCart() {
  $("#drawer").classList.remove("open");
  $("#scrim").classList.remove("open");
}

let flashTimer;
function flash(message) {
  clearTimeout(flashTimer);
  let el = $("#flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "flash";
    el.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#14201b;color:#fff;" +
      "padding:12px 18px;border-radius:999px;font-size:14px;z-index:99;box-shadow:0 10px 30px rgba(0,0,0,.25)";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  flashTimer = setTimeout(() => (el.style.display = "none"), 3200);
}

document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-cat]");
  if (chip) {
    state.category = chip.dataset.cat;
    renderFilters();
    renderCatalog();
  }

  const size = e.target.closest("[data-variant]");
  if (size) {
    state.selected[size.dataset.product] = size.dataset.variant;
    renderCatalog();
  }

  const add = e.target.closest("[data-add]");
  if (add) {
    const product = state.products.find((p) => p.id === add.dataset.add);
    if (!product) return;
    const variants = product.variants || [];
    const chosen =
      variants.find((v) => v.id === state.selected[product.id]) ||
      variants.find((v) => v.stock > 0);
    addToCart(product, chosen);
  }

  const qty = e.target.closest("[data-qty]");
  if (qty) setQty(qty.dataset.qty, Number(qty.dataset.delta));

  if (e.target.closest("#cartBtn")) openCart();
  if (e.target.closest("#closeCart") || e.target.closest("#scrim")) closeCart();
});

/* Arranque ---------------------------------------------------------------- */
(async function init() {
  renderCart();
  try {
    const res = await fetch("/api/products");
    const data = await res.json();
    state.products = data.products || [];
    renderFilters();
    renderCatalog();
  } catch (err) {
    $("#catalogCount").textContent = "No se pudo cargar el catálogo.";
    $("#grid").innerHTML = `<div class="alert error">Revisa tu conexión e intenta de nuevo.</div>`;
    console.error(err);
  }
})();

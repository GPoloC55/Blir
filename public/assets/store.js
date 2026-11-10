/* BLir · Tienda conectada a la API (catálogo, stock real, mayoreo y pago) */

const $ = (s) => document.querySelector(s);
const CART_KEY = "blir_cart_v2";

const m$ = (cents) =>
  "$" + (cents / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 }) + " MXN";

const state = {
  shop: null,
  mode: "retail",       // retail | wholesale
  filter: "all",
  cart: loadCart(),
  current: null,        // producto abierto
  sel: { size: "", qty: 1 },
};

/* Utilidades -------------------------------------------------------------- */
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}
const units = () => state.cart.reduce((a, l) => a + l.qty, 0);
const cartEmpty = () => state.cart.length === 0;

function tiers() {
  return (state.shop?.wholesale_tiers || []).slice().sort((a, b) => b.min_qty - a.min_qty);
}
function minWholesale() {
  const t = tiers();
  return t.length ? Math.min(...t.map((x) => x.min_qty)) : 6;
}
function wholesaleUnit(qty = units()) {
  const t = tiers();
  const hit = t.find((x) => qty >= x.min_qty);
  if (hit) return hit.price_cents;
  return t.length ? t[t.length - 1].price_cents : 34900;
}
function linePrice(line) {
  return state.mode === "wholesale" ? wholesaleUnit() : line.price_cents;
}
function total() {
  if (state.mode === "wholesale") return units() * wholesaleUnit();
  return state.cart.reduce((a, l) => a + l.price_cents * l.qty, 0);
}

/* Catálogo ---------------------------------------------------------------- */
function renderTiers() {
  if (state.mode !== "wholesale") {
    $("#tiers").innerHTML = "";
    return;
  }
  $("#tiers").innerHTML = tiers()
    .slice()
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((t) => `<div>${t.min_qty}+ piezas<b>${m$(t.price_cents)}</b></div>`)
    .join("");
}

function renderChips() {
  const cats = [{ slug: "all", name: "Todos" }, ...(state.shop?.categories || [])];
  $("#chips").innerHTML = cats
    .map(
      (c) =>
        `<button aria-pressed="${state.filter === c.slug}" data-f="${c.slug}">${c.name}</button>`
    )
    .join("");
}

function renderGrid() {
  const list = state.shop.products.filter(
    (p) => state.filter === "all" || p.category === state.filter
  );
  $("#empty").style.display = list.length ? "none" : "block";

  $("#grid").innerHTML = list
    .map((p) => {
      const stock = p.variants.reduce((a, v) => a + v.stock, 0);
      const price =
        state.mode === "wholesale" ? "desde " + m$(wholesaleUnit(0)) : m$(p.price_cents);
      return `<button class="card" data-i="${p.id}" aria-label="Ver ${p.name}">
        ${p.badge ? `<span class="bdg">${p.badge}</span>` : ""}
        <img src="${p.image_url}" alt="Suéter ${p.name}" loading="lazy" width="600" height="600">
        <div class="in"><div><h3>${p.name}</h3><small>S a XL</small></div><span class="pr">${price}</span></div>
        ${stock === 0 ? `<span class="sold">Agotado</span>` : ""}
      </button>`;
    })
    .join("");
}

/* Producto ---------------------------------------------------------------- */
function openProduct(id) {
  const p = state.shop.products.find((x) => x.id === id);
  if (!p) return;
  state.current = p;
  state.sel = { size: "", qty: 1 };
  $("#pi").src = p.image_url;
  $("#pi").alt = "Suéter " + p.name;
  $("#pn").textContent = p.name;
  $("#pd").showModal();
  renderProduct();
}

function renderProduct() {
  const p = state.current;
  const available = p.variants.filter((v) => v.stock > 0);
  const price =
    state.mode === "wholesale" ? wholesaleUnit(units() + state.sel.qty) : p.price_cents;

  $("#pp").textContent = m$(price);
  $("#pu").textContent =
    state.mode === "wholesale" ? "por pieza · baja con más volumen" : "por pieza";

  if (!available.length) {
    $("#sz").innerHTML = `<p class="stock" style="color:var(--red)">Todas las tallas agotadas</p>`;
    $("#add").disabled = true;
    return;
  }

  $("#sz").innerHTML = `
    <label style="display:grid;gap:4px;font-size:14px;color:var(--mute)">Talla
      <select id="tl">
        <option value="" disabled ${state.sel.size ? "" : "selected"}>Elige tu talla</option>
        ${p.variants
          .map(
            (v) =>
              `<option value="${v.id}" ${v.stock <= 0 ? "disabled" : ""} ${
                state.sel.size === v.id ? "selected" : ""
              }>${v.size}${v.stock <= 0 ? " — agotada" : v.stock <= 3 ? ` — quedan ${v.stock}` : ""}</option>`
          )
          .join("")}
      </select>
    </label>
    <div class="row" style="border:0"><span>Cantidad</span>
      <span class="st">
        <button type="button" data-d="-1" aria-label="Menos">−</button>
        <output>${state.sel.qty}</output>
        <button type="button" data-d="1" aria-label="Más">+</button>
      </span>
    </div>
    <p class="stock" id="stockInfo"></p>`;

  updateStockInfo();
  $("#add").disabled = !state.sel.size;
}

function updateStockInfo() {
  const info = $("#stockInfo");
  if (!info) return;
  const v = state.current.variants.find((x) => x.id === state.sel.size);
  info.textContent = v
    ? v.stock <= 3
      ? `Últimas ${v.stock} piezas en talla ${v.size}. Elige cualquier otra talla y se surte junto.`
      : `${v.stock} disponibles en talla ${v.size}.`
    : "";
}

/* Carrito ----------------------------------------------------------------- */
function renderCart() {
  $("#cn").textContent = units();

  if (cartEmpty()) {
    $("#lines").innerHTML = `<p style="color:var(--mute)">Aún no tienes piezas. Elige un modelo para empezar.</p>`;
  } else {
    $("#lines").innerHTML = state.cart
      .map(
        (l, k) => `<div class="row">
          <span>${l.name} · ${l.size} × ${l.qty}</span>
          <span>${m$(linePrice(l) * l.qty)}
            <button data-r="${k}" aria-label="Quitar" style="border:0;background:none;color:var(--red)">Quitar</button>
          </span>
        </div>`
      )
      .join("");
  }

  $("#tt").textContent = m$(total());

  let hint = "";
  if (state.mode === "wholesale") {
    const t = units();
    const min = minWholesale();
    const next = tiers()
      .slice()
      .sort((a, b) => a.min_qty - b.min_qty)
      .find((x) => t < x.min_qty);
    hint =
      t < min
        ? `Faltan ${min - t} piezas para el mínimo de mayoreo.`
        : next
        ? `Agrega ${next.min_qty - t} piezas más y baja a ${m$(next.price_cents)} por pieza.`
        : "Ya tienes el mejor precio por pieza.";
  }
  $("#hint").innerHTML = hint ? `<div class="hint">${hint}</div>` : "";

  const ready =
    !cartEmpty() && (state.mode === "retail" || units() >= minWholesale());
  $("#go").textContent = state.mode === "retail" ? "Pagar" : "Solicitar cotización";
  $("#go").disabled = !ready;
}

/* Modo (personal / mayoreo) ------------------------------------------------ */
function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("b2b", mode === "wholesale");
  $("#app").classList.toggle("b2b", mode === "wholesale");
  $("#mC").setAttribute("aria-pressed", mode === "retail");
  $("#mB").setAttribute("aria-pressed", mode === "wholesale");
  $("#sub").textContent =
    mode === "retail"
      ? "Tejidos con diseños de temporada, de renos a personajes. Elige tu modelo, tu talla y llévalo a casa."
      : "Surte tu tienda con mezcla libre de modelos y tallas. Mínimo 6 piezas; el precio baja al sumar piezas de cualquier modelo.";
  renderTiers();
  renderGrid();
  renderCart();
}

/* Carrito en la interfaz --------------------------------------------------- */
function addToCart() {
  if (!state.sel.size) return;
  const v = state.current.variants.find((x) => x.id === state.sel.size);
  if (!v || v.stock <= 0) return;

  const existing = state.cart.find((l) => l.variant_id === v.id);
  const inCart = existing ? existing.qty : 0;
  if (inCart + state.sel.qty > v.stock) {
    return alert(`Solo quedan ${v.stock} piezas de ${state.current.name} talla ${v.size}.`);
  }

  if (existing) {
    existing.qty += state.sel.qty;
  } else {
    state.cart.push({
      variant_id: v.id,
      product_id: state.current.id,
      name: state.current.name,
      size: v.size,
      price_cents: v.price_cents,
      image_url: state.current.image_url,
      stock: v.stock,
      qty: state.sel.qty,
    });
  }
  saveCart();
  renderCart();

  if (state.mode === "retail") {
    $("#pd").close();
    $("#cd").showModal();
  } else {
    const q = state.sel.qty;
    const s = v.size;
    state.sel = { size: "", qty: 1 };
    renderProduct();
    $("#sz").insertAdjacentHTML(
      "afterbegin",
      `<p class="hint">Agregado: ${q} × talla ${s}. Elige otra talla o cierra para ver tu carrito.</p>`
    );
  }
}

/* Checkout ---------------------------------------------------------------- */
function openForm() {
  const wholesale = state.mode === "wholesale";
  $("#err").style.display = "none";
  $("#fm").style.display = "grid";
  $("#ok").style.display = "none";
  $("#ft").textContent = wholesale ? "Datos para tu cotización" : "Datos de envío";
  $("#sb").textContent = wholesale ? "Enviar cotización" : "Continuar al pago";
  $("#legal").style.display = wholesale ? "none" : "block";
  $("#fm").querySelectorAll(".bo").forEach((el) => (el.style.display = wholesale ? "grid" : "none"));

  const select = $("#sm");
  const options = (state.shop.shipping || []).filter((s) =>
    wholesale ? s.code === "quote" : s.code !== "quote"
  );
  select.innerHTML = options
    .map(
      (s) =>
        `<option value="${s.code}">${s.label}${s.price_cents ? " — " + m$(s.price_cents) : " — Gratis"}</option>`
    )
    .join("");
  select.closest("label").style.display = wholesale ? "none" : "grid";
  syncForm();

  $("#cd").close();
  $("#fd").showModal();
}

/* La dirección solo es obligatoria si hay entrega a domicilio */
function syncForm() {
  const wholesale = state.mode === "wholesale";
  const pickup = !wholesale && $("#sm").value === "pickup";
  const dir = $("#dir");
  dir.style.display = pickup ? "none" : "grid";
  dir.querySelectorAll("input").forEach((i) => (i.required = !pickup));
  const coupon = $(".cp");
  if (coupon) coupon.style.display = wholesale ? "none" : "grid";
}

async function submitForm(e) {
  e.preventDefault();
  const btn = $("#sb");
  const err = $("#err");
  err.style.display = "none";

  const data = Object.fromEntries(new FormData(e.target));
  const wholesale = state.mode === "wholesale";

  const payload = {
    mode: state.mode,
    items: state.cart.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
    customer: {
      name: data.n.trim(),
      email: data.e.trim(),
      phone: data.t.trim(),
      company: (data.c || "").trim(),
      rfc: (data.r || "").trim(),
    },
    shipping_method: wholesale ? "quote" : data.sm,
    shipping_address: {
      street: data.d.trim(),
      city: data.ci.trim(),
      state: data.st.trim(),
      zip: data.z.trim(),
    },
    notes: wholesale ? "Cotización de mayoreo" : "",
    coupon: wholesale ? "" : (data.cp || "").trim(),
  };

  btn.disabled = true;
  btn.textContent = wholesale ? "Enviando…" : "Creando pedido…";

  try {
    const endpoint = wholesale ? "/api/orders" : "/api/checkout";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "No se pudo procesar la solicitud.");

    if (wholesale) {
      localStorage.removeItem(CART_KEY);
      state.cart = [];
      renderCart();
      e.target.style.display = "none";
      const wa = (state.shop.store?.phone || "").replace(/\D/g, "");
      const waLink = wa
        ? `<a class="wa" href="https://wa.me/${wa}?text=${encodeURIComponent(
            `Hola, acabo de pedir la cotización ${out.id} en blir.mx`
          )}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`
        : "";
      $("#ok").style.display = "block";
      $("#ok").innerHTML = `<h2>Cotización lista</h2>
        <p>${out.units} piezas · ${m$(out.total_cents)} + envío. Tu folio es <b>${out.id}</b>.</p>
        <p>Te respondemos con disponibilidad, tiempos de entrega y costo de envío.</p>
        ${waLink}`;
    } else {
      localStorage.removeItem(CART_KEY);
      state.cart = [];
      renderCart();
      location.href = out.init_point || out.redirect || `/gracias?order=${out.order_id}`;
    }
  } catch (ex) {
    err.textContent = ex.message;
    err.style.display = "block";
    btn.disabled = false;
    btn.textContent = wholesale ? "Enviar cotización" : "Continuar al pago";
  }
}

/* Eventos ----------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) {
    if (btn.dataset.close !== undefined) return btn.closest("dialog").close();
    if (btn.dataset.f) {
      state.filter = btn.dataset.f;
      renderChips();
      renderGrid();
      return;
    }
    if (btn.dataset.i) return openProduct(btn.dataset.i);
    if (btn.dataset.d) {
      const v = state.current.variants.find((x) => x.id === state.sel.size);
      const max = v ? v.stock : 99;
      state.sel.qty = Math.min(max, Math.max(1, state.sel.qty + Number(btn.dataset.d)));
      renderProduct();
      return;
    }
    if (btn.dataset.r) {
      state.cart.splice(Number(btn.dataset.r), 1);
      saveCart();
      renderCart();
      return;
    }
  }

  if (e.target.id === "cb") $("#cd").showModal();
  if (e.target.id === "go") return openForm();
  if (e.target.id === "add") return addToCart();
});

document.addEventListener("change", (e) => {
  if (e.target.id === "tl") {
    state.sel.size = e.target.value;
    const v = state.current.variants.find((x) => x.id === e.target.value);
    if (v) state.sel.qty = Math.min(state.sel.qty, Math.max(1, v.stock));
    renderProduct();
  }
  if (e.target.id === "sm") syncForm();
});

$("#mC").addEventListener("click", () => setMode("retail"));
$("#mB").addEventListener("click", () => setMode("wholesale"));
$("#fm").addEventListener("submit", submitForm);

/* Arranque ---------------------------------------------------------------- */
(async function init() {
  try {
    const res = await fetch("/api/shop");
    if (!res.ok) throw new Error("No se pudo cargar la tienda.");
    state.shop = await res.json();

    // Limpia líneas cuyo producto o variante ya no existe
    state.shop.products.flatMap((p) => p.variants);
    const valid = new Set(state.shop.products.flatMap((p) => p.variants.map((v) => v.id)));
    state.cart = state.cart.filter((l) => valid.has(l.variant_id));
    saveCart();

    if (!state.shop.payments_enabled) {
      const note = document.createElement("div");
      note.className = "msg info";
      note.style.margin = "0 0 18px";
      note.textContent =
        "Tienda en modo de prueba: el cobro en línea se activa al conectar Mercado Pago. Los pedidos no se cobran todavía.";
      $("#chips").before(note);
    }

    renderChips();
    setMode("retail");
  } catch (err) {
    console.error(err);
    $("#grid").innerHTML = `<p class="msg">No se pudo cargar el catálogo. Recarga la página.</p>`;
  }
})();

/* BLir · Panel de administración */
const $ = (s) => document.querySelector(s);
const money = (c) => (c / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const num = (c) => (c / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const date = (iso) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

const STATUS = ["pending", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"];
const STATUS_LABEL = {
  pending: "Pendiente", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Reembolsado",
};

let products = [];
let currentOrder = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("Sesión expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

/* Login ------------------------------------------------------------------- */
function showLogin() {
  $("#app").style.display = "none";
  $("#login").style.display = "block";
}
function showApp() {
  $("#login").style.display = "none";
  $("#app").style.display = "block";
  switchTab("orders");
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginError");
  err.style.display = "none";
  try {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.style.display = "block";
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/auth", { method: "DELETE" });
  location.reload();
});

document.querySelectorAll("[data-tab]").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  ({ orders: renderOrders, products: renderProducts, inventory: renderInventory, reports: renderReports })[tab]();
}

/* Pedidos ----------------------------------------------------------------- */
async function renderOrders() {
  $("#view").innerHTML = `
    <div class="toolbar">
      <input id="orderSearch" placeholder="Buscar pedido, correo o nombre…" style="flex:1;min-width:220px">
      <select id="orderStatus">
        <option value="">Todos los estados</option>
        ${STATUS.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("")}
      </select>
      <button class="btn" id="refreshOrders">Actualizar</button>
    </div>
    <div id="ordersTable">Cargando…</div>
    <div id="orderDetail"></div>`;

  const load = async () => {
    const q = encodeURIComponent($("#orderSearch").value.trim());
    const status = $("#orderStatus").value;
    const { orders } = await api(`/api/orders?q=${q}&status=${status}&limit=200`);
    $("#ordersTable").innerHTML = orders.length
      ? `<table>
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Envío</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr></thead>
          <tbody>${orders.map((o) => `
            <tr>
              <td><b>${esc(o.id)}</b></td>
              <td>${date(o.created_at)}</td>
              <td>${esc(o.customer?.name || "—")}<br><small style="color:var(--muted)">${esc(o.customer?.email || "")}</small></td>
              <td>${esc(o.shipping_method)}<br><small style="color:var(--muted)">${esc(o.shipping_address?.city || "")}</small></td>
              <td>${money(o.total_cents)}</td>
              <td><span class="pill ${o.payment_status === "paid" ? "paid" : "pending"}">${esc(o.payment_status)}</span></td>
              <td><span class="pill ${esc(o.status)}">${esc(STATUS_LABEL[o.status] || o.status)}</span></td>
              <td><button class="chip" data-order="${esc(o.id)}">Ver</button></td>
            </tr>`).join("")}
          </tbody></table>`
      : `<div class="panel">No hay pedidos con ese filtro.</div>`;
  };

  $("#orderSearch").addEventListener("input", debounce(load, 350));
  $("#orderStatus").addEventListener("change", load);
  $("#refreshOrders").addEventListener("click", load);
  await load();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-order]");
  if (!btn) return;
  const { orders } = await api(`/api/orders?q=${encodeURIComponent(btn.dataset.order)}&limit=5`);
  const order = orders.find((o) => o.id === btn.dataset.order);
  if (!order) return;
  currentOrder = order;
  const a = order.shipping_address || {};
  $("#orderDetail").innerHTML = `
    <div class="panel" style="margin-top:22px">
      <h2>Pedido ${esc(order.id)}</h2>
      <p class="hint">${date(order.created_at)} · ${esc(order.customer?.name || "")} · ${esc(order.customer?.phone || "")} · ${esc(order.customer?.email || "")}</p>
      <table style="margin:14px 0">
        <thead><tr><th>Producto</th><th>Talla</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>${(order.items || []).map((i) => `
          <tr><td>${esc(i.name)}</td><td>${esc(i.size)}</td><td>${i.qty}</td>
          <td>${money(i.unit_price_cents)}</td><td>${money(i.total_cents)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="two-col">
        <div>
          <div class="totals"><span>Subtotal</span><span>${money(order.subtotal_cents)}</span></div>
          <div class="totals"><span>Envío</span><span>${money(order.shipping_cents)}</span></div>
          <div class="totals"><span>Descuento</span><span>−${money(order.discount_cents)}</span></div>
          <div class="totals grand"><span>Total</span><span>${money(order.total_cents)}</span></div>
        </div>
        <div>
          <p class="hint"><b>Dirección:</b><br>
            ${esc(a.street || "—")}<br>${esc(a.city || "")} ${esc(a.state || "")} ${esc(a.zip || "")}</p>
          <div class="field"><label>Estado del pedido</label>
            <select id="setStatus">${STATUS.map((s) => `<option value="${s}" ${order.status === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Número de guía</label>
            <input id="setTracking" value="${esc(order.tracking_number || "")}" placeholder="Ej. 1234567890">
          </div>
          <div class="field"><label>URL de rastreo</label>
            <input id="setTrackingUrl" value="${esc(order.tracking_url || "")}" placeholder="https://…">
          </div>
          <button class="btn block" id="saveOrder">Guardar cambios</button>
        </div>
      </div>
    </div>`;

  $("#saveOrder").addEventListener("click", async () => {
    try {
      await api("/api/orders", {
        method: "PUT",
        body: JSON.stringify({
          id: order.id,
          status: $("#setStatus").value,
          tracking_number: $("#setTracking").value,
          tracking_url: $("#setTrackingUrl").value,
        }),
      });
      alert("Pedido actualizado.");
      renderOrders();
    } catch (ex) {
      alert(ex.message);
    }
  });
});

/* Productos --------------------------------------------------------------- */
async function renderProducts() {
  const data = await api("/api/products?scope=admin");
  products = data.products;

  $("#view").innerHTML = `
    <div class="toolbar">
      <button class="btn" id="newProduct">+ Nuevo producto</button>
      <span class="hint">Edita el stock de cada talla directamente en la tabla.</span>
    </div>
    <div id="productForm"></div>
    <table>
      <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Tallas / stock</th><th></th></tr></thead>
      <tbody>${products.map((p) => `
        <tr>
          <td><b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc(p.sku_base)}</small></td>
          <td>${esc(p.category)}</td>
          <td>${money(p.price_cents)}</td>
          <td>${money(p.cost_cents)}</td>
          <td>${(p.variants || []).map((v) => `
            <span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0">
              <b>${esc(v.size)}</b>
              <input data-stock="${v.id}" type="number" value="${v.stock}" min="0"
                     style="width:64px;padding:4px 6px;border:1px solid var(--line);border-radius:6px">
            </span>`).join("")}
          </td>
          <td><button class="chip" data-edit="${p.id}">Editar</button></td>
        </tr>`).join("")}
      </tbody>
    </table>`;

  $("#newProduct").addEventListener("click", () => productEditor(null));

  document.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = products.find((x) => x.id === b.dataset.edit);
      productEditor(p);
    })
  );

  document.querySelectorAll("[data-stock]").forEach((input) =>
    input.addEventListener("change", async () => {
      const variant = products.flatMap((p) => p.variants).find((v) => v.id === input.dataset.stock);
      const delta = Number(input.value) - variant.stock;
      if (!delta) return;
      try {
        await api("/api/inventory", {
          method: "POST",
          body: JSON.stringify({ variant_id: variant.id, delta, reason: "adjustment", note: "Ajuste desde productos" }),
        });
        variant.stock = Number(input.value);
        input.style.borderColor = "var(--green)";
        setTimeout(() => (input.style.borderColor = "var(--line)"), 900);
      } catch (ex) {
        alert(ex.message);
        input.value = variant.stock;
      }
    })
  );
}

function productEditor(p) {
  const isNew = !p;
  const sizes = p ? p.variants : [];
  $("#productForm").innerHTML = `
    <div class="panel" style="margin-bottom:20px">
      <h2>${isNew ? "Nuevo producto" : "Editar: " + esc(p.name)}</h2>
      <div class="row">
        <div class="field"><label>Nombre</label><input id="f_name" value="${esc(p?.name || "")}"></div>
        <div class="field"><label>SKU base</label><input id="f_sku" value="${esc(p?.sku_base || "")}" placeholder="BLIR-MODELO"></div>
      </div>
      <div class="row">
        <div class="field"><label>Categoría (slug)</label>
          <select id="f_category">
            ${["nuevo", "clasicos", "licencias", "personajes"].map((c) =>
              `<option ${p?.category === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Badge (opcional)</label><input id="f_badge" value="${esc(p?.badge || "")}" placeholder="Nuevo, Top…"></div>
      </div>
      <div class="row">
        <div class="field"><label>Precio (MXN)</label><input id="f_price" type="number" step="0.01" value="${p ? p.price_cents / 100 : 599}"></div>
        <div class="field"><label>Precio antes (MXN)</label><input id="f_compare" type="number" step="0.01" value="${p?.compare_at_cents ? p.compare_at_cents / 100 : ""}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Costo (MXN)</label><input id="f_cost" type="number" step="0.01" value="${p ? p.cost_cents / 100 : 290}"></div>
        <div class="field"><label>URL de imagen</label><input id="f_img" value="${esc(p?.image_url || "")}" placeholder="https://…"></div>
      </div>
      <div class="field"><label>Descripción</label><textarea id="f_desc" rows="2">${esc(p?.description || "")}</textarea></div>
      ${isNew ? `<div class="field"><label>Stock inicial por talla</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${["S", "M", "L", "XL"].map((s) => `<label class="hint">${s} <input id="stock_${s}" type="number" value="6" style="width:70px;padding:6px;border:1px solid var(--line);border-radius:6px"></label>`).join("")}
        </div></div>` : ""}
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn" id="saveProduct">Guardar</button>
        <button class="btn ghost" id="cancelProduct">Cancelar</button>
        ${!isNew ? `<button class="btn ghost" id="deactivateProduct" style="margin-left:auto;border-color:var(--red);color:var(--red)">Desactivar</button>` : ""}
      </div>
    </div>`;

  $("#cancelProduct").addEventListener("click", () => ($("#productForm").innerHTML = ""));

  $("#saveProduct").addEventListener("click", async () => {
    const body = {
      id: p?.id,
      name: $("#f_name").value.trim(),
      sku_base: $("#f_sku").value.trim(),
      category: $("#f_category").value,
      badge: $("#f_badge").value.trim(),
      price_cents: Math.round(Number($("#f_price").value) * 100),
      compare_at_cents: $("#f_compare").value ? Math.round(Number($("#f_compare").value) * 100) : null,
      cost_cents: Math.round(Number($("#f_cost").value) * 100),
      image_url: $("#f_img").value.trim(),
      description: $("#f_desc").value.trim(),
      variants: isNew
        ? ["S", "M", "L", "XL"].map((s) => ({ size: s, stock: Number($("#stock_" + s).value) || 0 }))
        : sizes.map((v) => ({ id: v.id, size: v.size, stock: v.stock, price_cents: v.price_cents })),
    };
    try {
      await api("/api/products", { method: "POST", body: JSON.stringify(body) });
      renderProducts();
    } catch (ex) {
      alert(ex.message);
    }
  });

  const del = $("#deactivateProduct");
  if (del) {
    del.addEventListener("click", async () => {
      if (!confirm("¿Desactivar este producto? Dejará de verse en la tienda.")) return;
      await api(`/api/products?id=${p.id}`, { method: "DELETE" });
      renderProducts();
    });
  }
}

/* Inventario -------------------------------------------------------------- */
async function renderInventory() {
  const [low, movs] = await Promise.all([
    api("/api/inventory?low=1&threshold=3"),
    api("/api/inventory?limit=80"),
  ]);

  $("#view").innerHTML = `
    <div class="two-col">
      <div>
        <div class="panel">
          <h2>Stock bajo (≤ 3)</h2>
          ${low.items.length ? `<table><thead><tr><th>Producto</th><th>Talla</th><th>Stock</th></tr></thead>
            <tbody>${low.items.map((i) => `<tr><td>${esc(i.product)}</td><td>${esc(i.size)}</td><td><b>${i.stock}</b></td></tr>`).join("")}</tbody></table>`
            : `<p class="hint">Todo el inventario está por encima del mínimo.</p>`}
        </div>
      </div>
      <div>
        <div class="panel">
          <h2>Ajustar inventario</h2>
          <div class="field"><label>Variante (SKU)</label><input id="adjSku" placeholder="BLIR-SANTA-M"></div>
          <div class="field"><label>Cantidad (+ entrada / − salida)</label><input id="adjDelta" type="number" value="10"></div>
          <div class="field"><label>Motivo</label>
            <select id="adjReason"><option value="purchase">Compra a proveedor</option><option value="adjustment">Ajuste</option><option value="return">Devolución</option></select>
          </div>
          <button class="btn block" id="adjBtn">Aplicar movimiento</button>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h2>Últimos movimientos</h2>
      <table><thead><tr><th>Fecha</th><th>Producto</th><th>Talla</th><th>Cambio</th><th>Motivo</th><th>Pedido</th></tr></thead>
      <tbody>${movs.movements.map((m) => `<tr>
        <td>${date(m.created_at)}</td><td>${esc(m.product)}</td><td>${esc(m.size)}</td>
        <td><b style="color:${m.delta > 0 ? "var(--green)" : "var(--red)"}">${m.delta > 0 ? "+" : ""}${m.delta}</b></td>
        <td>${esc(m.reason)}</td><td>${esc(m.order_id || "")}</td></tr>`).join("")}</tbody></table>
    </div>`;

  $("#adjBtn").addEventListener("click", async () => {
    const sku = $("#adjSku").value.trim().toUpperCase();
    const variant = products.flatMap((p) => p.variants).find((v) => v.sku === sku);
    if (!variant) return alert("SKU no encontrado. Recarga la pestaña Productos.");
    try {
      await api("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ variant_id: variant.id, delta: Number($("#adjDelta").value), reason: $("#adjReason").value }),
      });
      renderInventory();
    } catch (ex) {
      alert(ex.message);
    }
  });
}

/* Reportes ---------------------------------------------------------------- */
async function renderReports() {
  const data = await api("/api/reports?days=30&stale=60");
  const k = data.kpis || {};
  const max = Math.max(1, ...data.daily.map((d) => Number(d.revenue_cents)));

  $("#view").innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Ventas 30 días</span><b>${money(k.revenue_cents || 0)}</b></div>
      <div class="kpi"><span>Pedidos pagados</span><b>${k.orders || 0}</b></div>
      <div class="kpi"><span>Ticket promedio</span><b>${money(k.aov_cents || 0)}</b></div>
      <div class="kpi"><span>Piezas vendidas</span><b>${k.units || 0}</b></div>
      <div class="kpi"><span>Inventario (costo)</span><b>${money(data.inventory.capital_cents || 0)}</b></div>
    </div>

    <div class="panel" style="margin-bottom:18px">
      <h2>Ventas por día</h2>
      <div class="bars">${data.daily.map((d) => `
        <div title="${d.day}: ${money(d.revenue_cents)} (${d.orders} pedidos)"
             style="height:${Math.max(2, (Number(d.revenue_cents) / max) * 100)}%"></div>`).join("")}</div>
      <p class="hint" style="margin-top:8px">Últimos ${data.range_days} días · máximo ${money(max)}</p>
    </div>

    <div class="two-col">
      <div class="panel">
        <h2>Más vendidos</h2>
        <table><thead><tr><th>Producto</th><th>Piezas</th><th>Ingreso</th></tr></thead>
        <tbody>${(data.top_products || []).map((p) => `<tr><td>${esc(p.name)}</td><td>${p.units}</td><td>${money(p.revenue_cents)}</td></tr>`).join("") || `<tr><td colspan="3" class="hint">Sin ventas todavía.</td></tr>`}</tbody></table>
      </div>
      <div class="panel">
        <h2>Productos estancados (60 días)</h2>
        <p class="hint">Con stock y sin ventas: capital inmovilizado.</p>
        <table><thead><tr><th>Producto</th><th>Talla</th><th>Stock</th><th>Capital</th></tr></thead>
        <tbody>${(data.dead_stock || []).slice(0, 12).map((d) => `<tr><td>${esc(d.product)}</td><td>${esc(d.size)}</td><td>${d.stock}</td><td>${money(d.capital_cents)}</td></tr>`).join("") || `<tr><td colspan="4" class="hint">Sin productos estancados.</td></tr>`}</tbody></table>
      </div>
    </div>

    <div class="two-col" style="margin-top:18px">
      <div class="panel">
        <h2>Ventas por categoría</h2>
        <table><thead><tr><th>Categoría</th><th>Piezas</th><th>Ingreso</th></tr></thead>
        <tbody>${(data.by_category || []).map((c) => `<tr><td>${esc(c.category)}</td><td>${c.units}</td><td>${money(c.revenue_cents)}</td></tr>`).join("") || `<tr><td colspan="3" class="hint">Sin datos.</td></tr>`}</tbody></table>
      </div>
      <div class="panel">
        <h2>Stock crítico</h2>
        <table><thead><tr><th>Producto</th><th>Talla</th><th>Stock</th></tr></thead>
        <tbody>${(data.low_stock || []).map((l) => `<tr><td>${esc(l.product)}</td><td>${esc(l.size)}</td><td><b>${l.stock}</b></td></tr>`).join("") || `<tr><td colspan="3" class="hint">Todo bien.</td></tr>`}</tbody></table>
      </div>
    </div>`;
}

/* Arranque ---------------------------------------------------------------- */
(async function init() {
  try {
    const { authed } = await api("/api/auth");
    if (authed) showApp();
    else showLogin();
  } catch {
    showLogin();
  }
})();

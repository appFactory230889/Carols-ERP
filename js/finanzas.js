import { db } from "./firebase-config.js";
import { ref as dbRef, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, money, toast, confirmar } from "./utils.js";

// Mismas categorías que ya se usaban en el control financiero en Excel del negocio.
const CATEGORIAS = {
  Entrada: ["Venta", "Anticipo", "Otro ingreso"],
  Salida: ["Materia Prima", "Salarios", "Abono a Credito", "Otro gasto"],
};

function pad(n) {
  return String(n).padStart(2, "0");
}
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function primerDiaMesISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
// "dd/mm/yyyy" (como se guarda en Firebase) <-> Date
function parseFecha(fechaStr) {
  const [d, m, y] = String(fechaStr || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}
function isoToDDMMYYYY(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

let movimientos = []; // [{key, periodo, ...datos}]

onValue(dbRef(db, "FINANZAS"), (snapshot) => {
  movimientos = [];
  snapshot.forEach((periodoSnap) => {
    if (periodoSnap.key === "Periodos") return;
    periodoSnap.forEach((mSnap) => {
      movimientos.push({ key: mSnap.key, periodo: periodoSnap.key, ...mSnap.val() });
    });
  });
  actualizarTodo();
});

const inputDesde = document.getElementById("f-desde");
const inputHasta = document.getElementById("f-hasta");
inputDesde.value = primerDiaMesISO();
inputHasta.value = hoyISO();
inputDesde.addEventListener("change", actualizarTodo);
inputHasta.addEventListener("change", actualizarTodo);

function enRango(fechaStr) {
  const fecha = parseFecha(fechaStr);
  if (!fecha) return false;
  fecha.setHours(0, 0, 0, 0);
  const desde = new Date(inputDesde.value + "T00:00:00");
  const hasta = new Date(inputHasta.value + "T00:00:00");
  return fecha >= desde && fecha <= hasta;
}

function actualizarTodo() {
  const enRangoLista = movimientos.filter((m) => enRango(m.fecha));

  const totalEntradas = enRangoLista.filter((m) => m.tipo === "Entrada").reduce((a, m) => a + (Number(m.monto) || 0), 0);
  const totalSalidas = enRangoLista.filter((m) => m.tipo === "Salida").reduce((a, m) => a + (Number(m.monto) || 0), 0);
  document.getElementById("v-entradas").textContent = money(totalEntradas);
  document.getElementById("v-salidas").textContent = money(totalSalidas);
  document.getElementById("v-utilidad").textContent = money(totalEntradas - totalSalidas);

  renderCategorias(enRangoLista);
  renderMeses(movimientos);
  renderMovimientos(enRangoLista);
}

function renderCategorias(lista) {
  const cont = document.getElementById("lista-categorias");
  const porCategoria = {};
  lista.forEach((m) => {
    const cat = m.categoria || "Sin categoría";
    porCategoria[cat] = (porCategoria[cat] || 0) + (Number(m.monto) || 0);
  });
  const categorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
  if (!categorias.length) {
    cont.innerHTML = '<div class="empty-state">Sin movimientos en este rango.</div>';
    return;
  }
  cont.innerHTML = categorias
    .map(
      (cat) => `
      <div class="card-row" style="padding:6px 0;">
        <span>${escapeHtml(cat)}</span>
        <strong>${money(porCategoria[cat])}</strong>
      </div>`
    )
    .join("");
}

function renderMeses(lista) {
  const cont = document.getElementById("lista-meses");
  const porPeriodo = {};
  lista.forEach((m) => {
    const p = m.periodo || "?";
    if (!porPeriodo[p]) porPeriodo[p] = { entradas: 0, salidas: 0 };
    if (m.tipo === "Entrada") porPeriodo[p].entradas += Number(m.monto) || 0;
    else porPeriodo[p].salidas += Number(m.monto) || 0;
  });
  const periodos = Object.keys(porPeriodo).sort().reverse();
  if (!periodos.length) {
    cont.innerHTML = '<div class="empty-state">Sin movimientos registrados todavía.</div>';
    return;
  }
  cont.innerHTML = periodos
    .map((p) => {
      const { entradas, salidas } = porPeriodo[p];
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;">${escapeHtml(p)}</div>
          <div class="muted" style="font-size:0.8rem;">Entradas ${money(entradas)} · Salidas ${money(salidas)}</div>
        </div>
        <strong style="white-space:nowrap;">${money(entradas - salidas)}</strong>
      </div>`;
    })
    .join("");
}

function renderMovimientos(lista) {
  const cont = document.getElementById("lista-movimientos");
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">Sin movimientos en este rango.</div>';
    return;
  }
  const ordenada = [...lista].sort((a, b) => (parseFecha(b.fecha) || 0) - (parseFecha(a.fecha) || 0));
  cont.innerHTML = ordenada
    .map(
      (m) => `
      <div class="card">
        <div class="card-row">
          <div>
            <h3>${escapeHtml(m.categoria)}</h3>
            <p>${escapeHtml(m.fecha)} · ${escapeHtml(m.tipo)}</p>
          </div>
          <div style="text-align:right;">
            <div class="value" style="color:${m.tipo === "Entrada" ? "var(--verde)" : "var(--rojo)"};">${m.tipo === "Entrada" ? "+" : "-"}${money(m.monto)}</div>
            <button class="btn btn-outline btn-sm" data-eliminar="${escapeHtml(m.periodo)}|${escapeHtml(m.key)}" style="margin-top:6px;">Eliminar</button>
          </div>
        </div>
      </div>`
    )
    .join("");

  cont.querySelectorAll("[data-eliminar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirmar("¿Eliminar este movimiento del registro financiero?")) return;
      const [periodo, key] = btn.dataset.eliminar.split("|");
      try {
        await remove(dbRef(db, `FINANZAS/${periodo}/${key}`));
        toast("Movimiento eliminado.", "success");
      } catch (e) {
        toast("Error al eliminar: " + e.message, "error");
      }
    });
  });
}

/* ---------- Modal: registrar movimiento ---------- */
const modal = document.getElementById("modal-movimiento");
const mFecha = document.getElementById("m-fecha");
const mTipo = document.getElementById("m-tipo");
const mCategoria = document.getElementById("m-categoria");
const mMonto = document.getElementById("m-monto");

function llenarCategorias() {
  mCategoria.innerHTML = CATEGORIAS[mTipo.value].map((c) => `<option value="${c}">${c}</option>`).join("");
}
mTipo.addEventListener("change", llenarCategorias);

document.getElementById("btn-agregar").addEventListener("click", () => {
  mFecha.value = hoyISO();
  mTipo.value = "Entrada";
  llenarCategorias();
  mMonto.value = "";
  modal.hidden = false;
});

document.getElementById("btn-cancelar-movimiento").addEventListener("click", () => (modal.hidden = true));

document.getElementById("btn-guardar-movimiento").addEventListener("click", async () => {
  const monto = mMonto.value.trim();
  if (!mFecha.value || !monto || Number(monto) <= 0) {
    toast("Complete la fecha y un monto válido.", "error");
    return;
  }
  const fecha = isoToDDMMYYYY(mFecha.value);
  const [y, m] = mFecha.value.split("-");
  const periodo = `${y}-${m}`;

  const datos = {
    fecha,
    tipo: mTipo.value,
    categoria: mCategoria.value,
    monto,
    periodo,
  };

  try {
    const nuevaRef = push(dbRef(db, `FINANZAS/${periodo}`));
    await set(nuevaRef, datos);
    await update(dbRef(db, `FINANZAS/Periodos/${periodo}`), { periodo });
    toast("Movimiento registrado.", "success");
    modal.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  }
});

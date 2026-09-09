import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, toast, confirmar } from "./utils.js";
import { renderBarChartCategorias, renderBarChartMensual } from "./charts.js";

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
  const porCategoria = {};
  lista.forEach((m) => {
    const cat = m.categoria || "Sin categoría";
    porCategoria[cat] = (porCategoria[cat] || 0) + (Number(m.monto) || 0);
  });
  const datos = Object.keys(porCategoria).map((label) => ({ label, value: porCategoria[label] }));
  renderBarChartCategorias("lista-categorias", datos);
}

function renderMeses(lista) {
  const porPeriodo = {};
  lista.forEach((m) => {
    const p = m.periodo || "?";
    if (!porPeriodo[p]) porPeriodo[p] = { entradas: 0, salidas: 0 };
    if (m.tipo === "Entrada") porPeriodo[p].entradas += Number(m.monto) || 0;
    else porPeriodo[p].salidas += Number(m.monto) || 0;
  });
  const datos = Object.keys(porPeriodo).map((periodo) => ({ periodo, ...porPeriodo[periodo] }));
  renderBarChartMensual("lista-meses", datos);
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
          ${m.fotoComprobante ? `<a href="${m.fotoComprobante}" target="_blank"><img class="pieza-foto" src="${m.fotoComprobante}" alt="Comprobante" style="width:56px;height:56px;" /></a>` : ""}
          <div style="flex:1;">
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

let archivoComprobante = null;
const mFoto = document.getElementById("m-foto");
const mPreview = document.getElementById("m-preview");

document.getElementById("btn-agregar").addEventListener("click", () => {
  mFecha.value = hoyISO();
  mTipo.value = "Entrada";
  llenarCategorias();
  mMonto.value = "";
  mFoto.value = "";
  mPreview.style.display = "none";
  archivoComprobante = null;
  modal.hidden = false;
});

mFoto.addEventListener("change", (e) => {
  archivoComprobante = e.target.files[0] || null;
  if (archivoComprobante) {
    mPreview.src = URL.createObjectURL(archivoComprobante);
    mPreview.style.display = "block";
  } else {
    mPreview.style.display = "none";
  }
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

  const btn = document.getElementById("btn-guardar-movimiento");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const nuevaRef = push(dbRef(db, `FINANZAS/${periodo}`));

    let fotoComprobante = "";
    if (archivoComprobante) {
      const refFoto = storageRef(storage, `FINANZAS_COMPROBANTES/${periodo}/${nuevaRef.key}.jpg`);
      await uploadBytes(refFoto, archivoComprobante);
      fotoComprobante = await getDownloadURL(refFoto);
    }

    const datos = {
      fecha,
      tipo: mTipo.value,
      categoria: mCategoria.value,
      monto,
      periodo,
      ...(fotoComprobante ? { fotoComprobante } : {}),
    };

    await set(nuevaRef, datos);
    await update(dbRef(db, `FINANZAS/Periodos/${periodo}`), { periodo });
    toast("Movimiento registrado.", "success");
    modal.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

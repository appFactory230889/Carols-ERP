import { db } from "./firebase-config.js";
import { ref as dbRef, onValue, get, set, update, remove, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, money, toast, confirmar } from "./utils.js";
import { renderBarChartCategorias } from "./charts.js";

const RUTA_CUENTAS = "DISTRIBUCION/Cuentas";
const RUTA_HISTORIAL = "DISTRIBUCION/Historial";

// Cuentas por defecto, tomadas de la distribución real que ya manejaba el negocio.
// Solo se usan la primera vez, si todavía no existe ninguna cuenta configurada.
const CUENTAS_POR_DEFECTO = [
  { nombre: "Reinversión", porcentaje: 40 },
  { nombre: "Pago de Salarios", porcentaje: 15 },
  { nombre: "Pago de deudas", porcentaje: 15 },
  { nombre: "Caja Chica", porcentaje: 15 },
  { nombre: "Salario Melissa", porcentaje: 7.5 },
  { nombre: "Salario Josué", porcentaje: 7.5 },
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// "dd/mm/yyyy" (como se guarda en FINANZAS) -> "yyyy-mm-dd" (clave de Firebase, sin "/")
function fechaAISO(fechaStr) {
  const [d, m, y] = String(fechaStr || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

let cuentas = []; // [{id, nombre, porcentaje, saldo}]

async function asegurarCuentasPorDefecto() {
  const snap = await get(dbRef(db, RUTA_CUENTAS));
  if (snap.exists()) return;
  for (const c of CUENTAS_POR_DEFECTO) {
    const nuevaRef = push(dbRef(db, RUTA_CUENTAS));
    await set(nuevaRef, { nombre: c.nombre, porcentaje: c.porcentaje, saldo: 0 });
  }
}

/* ---------- Reparto automático de cada Entrada nueva ---------- */
async function repartirPendientes() {
  const [cuentasSnap, finanzasSnap] = await Promise.all([get(dbRef(db, RUTA_CUENTAS)), get(dbRef(db, "FINANZAS"))]);
  if (!cuentasSnap.exists()) return;

  const listaCuentas = [];
  cuentasSnap.forEach((c) => listaCuentas.push({ id: c.key, ...c.val() }));
  if (!listaCuentas.length) return;

  const pendientes = [];
  finanzasSnap.forEach((periodoSnap) => {
    if (periodoSnap.key === "Periodos") return;
    periodoSnap.forEach((mSnap) => {
      const m = mSnap.val();
      if (m.tipo === "Entrada" && !m.distribuido) {
        pendientes.push({ periodo: periodoSnap.key, key: mSnap.key, ...m });
      }
    });
  });

  for (const mov of pendientes) {
    const monto = Number(mov.monto) || 0;
    const fechaISO = fechaAISO(mov.fecha) || hoyISO();

    for (const cuenta of listaCuentas) {
      const parte = Math.round(((monto * (Number(cuenta.porcentaje) || 0)) / 100) * 100) / 100;
      if (!parte) continue;
      await runTransaction(dbRef(db, `${RUTA_CUENTAS}/${cuenta.id}/saldo`), (actual) => (Number(actual) || 0) + parte);
      await runTransaction(dbRef(db, `${RUTA_HISTORIAL}/${fechaISO}/${cuenta.id}`), (actual) => (Number(actual) || 0) + parte);
    }
    await update(dbRef(db, `FINANZAS/${mov.periodo}/${mov.key}`), { distribuido: true });
  }
}

await asegurarCuentasPorDefecto();
await repartirPendientes();

/* ---------- Render de cuentas (saldo actual) ---------- */
onValue(dbRef(db, RUTA_CUENTAS), (snapshot) => {
  cuentas = [];
  snapshot.forEach((c) => cuentas.push({ id: c.key, ...c.val() }));
  renderCuentas();
  actualizarRango();
});

function renderCuentas() {
  const cont = document.getElementById("lista-cuentas");
  const sumaPorcentaje = cuentas.reduce((acc, c) => acc + (Number(c.porcentaje) || 0), 0);
  const spanSuma = document.getElementById("v-suma-porcentaje");
  spanSuma.textContent = `Suma de porcentajes: ${sumaPorcentaje}%`;
  spanSuma.style.color = Math.abs(sumaPorcentaje - 100) < 0.01 ? "var(--text-muted)" : "var(--rojo)";

  if (!cuentas.length) {
    cont.innerHTML = '<div class="empty-state">No hay cuentas configuradas.</div>';
    return;
  }
  cont.innerHTML = cuentas
    .map(
      (c) => `
      <div class="card">
        <div class="card-row">
          <div>
            <h3>${escapeHtml(c.nombre)}</h3>
            <p>${c.porcentaje}% de cada entrada</p>
          </div>
          <div style="text-align:right;">
            <div class="value">${money(c.saldo)}</div>
            <button class="btn btn-outline btn-sm" data-editar="${escapeHtml(c.id)}" style="margin-top:6px;">Editar</button>
          </div>
        </div>
      </div>`
    )
    .join("");

  cont.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEditar(btn.dataset.editar));
  });
}

/* ---------- Rango de fechas: cuánto entró a cada cuenta ---------- */
const inputDesde = document.getElementById("f-desde");
const inputHasta = document.getElementById("f-hasta");
inputDesde.value = hoyISO();
inputHasta.value = hoyISO();
inputDesde.addEventListener("change", actualizarRango);
inputHasta.addEventListener("change", actualizarRango);

function actualizarRango() {
  if (!cuentas.length) return;
  get(dbRef(db, RUTA_HISTORIAL)).then((snapshot) => {
    const totalesPorCuenta = {};
    cuentas.forEach((c) => (totalesPorCuenta[c.id] = 0));

    snapshot.forEach((diaSnap) => {
      const fecha = diaSnap.key;
      if (fecha < inputDesde.value || fecha > inputHasta.value) return;
      diaSnap.forEach((cuentaSnap) => {
        if (totalesPorCuenta[cuentaSnap.key] === undefined) totalesPorCuenta[cuentaSnap.key] = 0;
        totalesPorCuenta[cuentaSnap.key] += Number(cuentaSnap.val()) || 0;
      });
    });

    const datos = cuentas.map((c) => ({ label: c.nombre, value: totalesPorCuenta[c.id] || 0 }));
    renderBarChartCategorias("lista-rango", datos);
  });
}

/* ---------- Agregar cuenta ---------- */
const modalAgregar = document.getElementById("modal-cuenta");
document.getElementById("btn-agregar").addEventListener("click", () => {
  document.getElementById("cu-nombre").value = "";
  document.getElementById("cu-porcentaje").value = "";
  document.querySelectorAll("#modal-cuenta .error-text").forEach((el) => el.classList.remove("visible"));
  modalAgregar.hidden = false;
});
document.getElementById("btn-cancelar-cuenta").addEventListener("click", () => (modalAgregar.hidden = true));

document.getElementById("btn-guardar-cuenta").addEventListener("click", async () => {
  const nombre = document.getElementById("cu-nombre").value.trim();
  const porcentaje = document.getElementById("cu-porcentaje").value.trim();
  const errores = document.querySelectorAll("#modal-cuenta .error-text");
  let valido = true;
  errores[0].classList.toggle("visible", !nombre);
  if (!nombre) valido = false;
  const porcentajeInvalido = porcentaje === "" || Number(porcentaje) < 0;
  errores[1].classList.toggle("visible", porcentajeInvalido);
  if (porcentajeInvalido) valido = false;
  if (!valido) {
    toast("Complete todos los campos.", "error");
    return;
  }
  try {
    const nuevaRef = push(dbRef(db, RUTA_CUENTAS));
    await set(nuevaRef, { nombre, porcentaje: Number(porcentaje), saldo: 0 });
    toast("Cuenta agregada.", "success");
    modalAgregar.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  }
});

/* ---------- Editar / eliminar cuenta ---------- */
const modalEditar = document.getElementById("modal-editar-cuenta");
let cuentaEditando = null;

function abrirModalEditar(id) {
  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta) return;
  cuentaEditando = id;
  document.getElementById("ce-nombre").value = cuenta.nombre;
  document.getElementById("ce-porcentaje").value = cuenta.porcentaje;
  modalEditar.hidden = false;
}
document.getElementById("btn-cancelar-editar-cuenta").addEventListener("click", () => (modalEditar.hidden = true));

document.getElementById("btn-guardar-editar-cuenta").addEventListener("click", async () => {
  const nombre = document.getElementById("ce-nombre").value.trim();
  const porcentaje = Number(document.getElementById("ce-porcentaje").value);
  if (!nombre || porcentaje < 0) {
    toast("Complete todos los campos.", "error");
    return;
  }
  try {
    await update(dbRef(db, `${RUTA_CUENTAS}/${cuentaEditando}`), { nombre, porcentaje });
    toast("Cuenta actualizada.", "success");
    modalEditar.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  }
});

document.getElementById("btn-eliminar-cuenta").addEventListener("click", async () => {
  if (!confirmar("¿Eliminar esta cuenta? Su saldo acumulado y su historial no se borrarán del reparto ya hecho, pero dejará de recibir nuevos repartos.")) return;
  try {
    await remove(dbRef(db, `${RUTA_CUENTAS}/${cuentaEditando}`));
    toast("Cuenta eliminada.", "success");
    modalEditar.hidden = true;
  } catch (e) {
    toast("Error al eliminar: " + e.message, "error");
  }
});

import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, snapshotToEntries, toast } from "./utils.js";

// Las 6 telas que muestra el módulo de Inventario en la app Android (ViewPagerAdapter15).
// "ruta" es la key EXACTA del nodo en Firebase (INVENTARIO GLOBAL/{ruta}) — no siempre coincide
// con el label bonito (ej. "Solido" va sin tilde en el nodo real).
// Nota sobre "Chol-Li": en Android, esa pestaña lee por error el nodo "Lupulus" (un nombre
// legado) en vez de "Chol-Li" — el resto del sistema (TELAS, COLORES, Crear Pedido) ya usa
// "Chol-Li". Aquí se usa el nodo correcto y consistente ("Chol-Li"), así que si comparas contra
// la app Android para esta tela en particular, pueden no coincidir.
const TELAS_INVENTARIO = [
  { label: "Piel de Durazno Sólido", ruta: "Piel de Durazno Solido" },
  { label: "Piel de Durazno Estampado", ruta: "Piel de Durazno Estampado" },
  { label: "Liverpool Sólido", ruta: "Liverpool Solido" },
  { label: "Liverpool Estampado", ruta: "Liverpool Estampado" },
  { label: "Canaleada de Algodón", ruta: "Canaleada de Algodón" },
  { label: "Chol-Li", ruta: "Chol-Li" },
];

let telaActiva = TELAS_INVENTARIO[0].ruta;

const tabsCont = document.getElementById("tabs-inventario");
const panelesCont = document.getElementById("paneles-inventario");

tabsCont.innerHTML = TELAS_INVENTARIO.map(
  (t, i) => `<button class="tab-btn${i === 0 ? " active" : ""}" data-ruta="${escapeHtml(t.ruta)}">${escapeHtml(t.label)}</button>`
).join("");

panelesCont.innerHTML = TELAS_INVENTARIO.map(
  (t, i) => `<div class="tab-panel${i === 0 ? " active" : ""}" id="panel-${cssId(t.ruta)}"><div class="loader">Cargando colores…</div></div>`
).join("");

function cssId(ruta) {
  return ruta.replace(/[^a-zA-Z0-9]/g, "-");
}

tabsCont.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    tabsCont.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    panelesCont.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + cssId(btn.dataset.ruta)).classList.add("active");
    telaActiva = btn.dataset.ruta;
  });
});

function renderColores(ruta, colores) {
  const cont = document.getElementById("panel-" + cssId(ruta));
  if (!colores.length) {
    cont.innerHTML = '<div class="empty-state">Sin colores registrados para esta tela.</div>';
    return;
  }
  cont.innerHTML = colores
    .map(
      ([codColor, c]) => `
      <div class="card">
        <div class="card-row">
          ${c.imagen ? `<img class="pieza-foto" src="${c.imagen}" alt="" style="width:64px;height:64px;" />` : ""}
          <div style="flex:1;">
            <h3>${escapeHtml(c.color)}</h3>
            <p>${escapeHtml(c.cantidad || "0")} yardas disponibles</p>
          </div>
          <button class="btn btn-outline btn-sm" data-actualizar="${escapeHtml(codColor)}" data-color="${escapeHtml(c.color)}">Actualizar</button>
        </div>
      </div>`
    )
    .join("");

  cont.querySelectorAll("[data-actualizar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalActualizar(ruta, btn.dataset.actualizar, btn.dataset.color));
  });
}

TELAS_INVENTARIO.forEach((t) => {
  onValue(dbRef(db, `INVENTARIO GLOBAL/${t.ruta}`), (snapshot) => {
    renderColores(t.ruta, snapshotToEntries(snapshot));
  });
});

/* ---------- Actualizar cantidad ---------- */
const modalActualizar = document.getElementById("modal-actualizar");
let contextoActualizar = null;

function abrirModalActualizar(tipoTela, codColor, nombreColor) {
  contextoActualizar = { tipoTela, codColor };
  document.getElementById("ac-color-nombre").textContent = nombreColor;
  document.getElementById("ac-cantidad").value = "";
  modalActualizar.hidden = false;
}

document.getElementById("btn-guardar-cantidad").addEventListener("click", async () => {
  const valor = document.getElementById("ac-cantidad").value.trim();
  if (!valor) {
    toast("Ingrese una cantidad.", "error");
    return;
  }
  await guardarCantidad(valor);
});

document.getElementById("btn-poner-cero").addEventListener("click", async () => {
  await guardarCantidad("0");
});

async function guardarCantidad(valor) {
  try {
    const { tipoTela, codColor } = contextoActualizar;
    await set(dbRef(db, `INVENTARIO GLOBAL/${tipoTela}/${codColor}/cantidad`), valor);
    toast("Inventario actualizado.", "success");
    modalActualizar.hidden = true;
  } catch (e) {
    toast("Error al actualizar: " + e.message, "error");
  }
}

document.getElementById("modal-actualizar").addEventListener("click", (e) => {
  if (e.target === modalActualizar) modalActualizar.hidden = true;
});

/* ---------- Agregar color nuevo ---------- */
const modalAgregarColor = document.getElementById("modal-agregar-color");
const btnGuardarColor = document.getElementById("btn-guardar-color");
let archivoColor = null;

document.getElementById("btn-agregar-color").addEventListener("click", () => {
  const tela = TELAS_INVENTARIO.find((t) => t.ruta === telaActiva);
  document.getElementById("col-tela-nombre").textContent = tela ? tela.label : telaActiva;
  document.getElementById("col-nombre").value = "";
  document.getElementById("col-foto").value = "";
  document.getElementById("col-preview").style.display = "none";
  archivoColor = null;
  document.querySelectorAll("#modal-agregar-color .error-text").forEach((el) => el.classList.remove("visible"));
  modalAgregarColor.hidden = false;
});

document.getElementById("btn-cancelar-color").addEventListener("click", () => (modalAgregarColor.hidden = true));

document.getElementById("col-foto").addEventListener("change", (e) => {
  archivoColor = e.target.files[0] || null;
  const preview = document.getElementById("col-preview");
  if (archivoColor) {
    preview.src = URL.createObjectURL(archivoColor);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

btnGuardarColor.addEventListener("click", async () => {
  const nombre = document.getElementById("col-nombre").value.trim();
  const errores = document.querySelectorAll("#modal-agregar-color .error-text");

  let valido = true;
  errores[0].classList.toggle("visible", !nombre);
  if (!nombre) valido = false;
  errores[1].classList.toggle("visible", !archivoColor);
  if (!archivoColor) valido = false;

  if (!valido) {
    toast("Complete todos los campos.", "error");
    return;
  }

  btnGuardarColor.disabled = true;
  btnGuardarColor.textContent = "Guardando…";

  try {
    const codColor = String(Date.now());
    const refFoto = storageRef(storage, `COLORES_IMG/${codColor}.jpg`);
    await uploadBytes(refFoto, archivoColor);
    const urlFoto = await getDownloadURL(refFoto);

    const seo = nombre.toLowerCase().trim().replace(/\s+/g, "-");

    await set(dbRef(db, `COLORES/${telaActiva}/${codColor}`), {
      codColor,
      color: nombre,
      tipoTela: telaActiva,
      imagen: urlFoto,
      seo,
    });

    await set(dbRef(db, `INVENTARIO GLOBAL/${telaActiva}/${codColor}`), {
      codColor,
      color: nombre,
      tipoTela: telaActiva,
      imagen: urlFoto,
      seo,
      cantidad: "0",
    });

    toast("Color agregado con éxito.", "success");
    modalAgregarColor.hidden = true;
  } catch (e) {
    toast("Error al guardar el color: " + e.message, "error");
  } finally {
    btnGuardarColor.disabled = false;
    btnGuardarColor.textContent = "Guardar";
  }
});

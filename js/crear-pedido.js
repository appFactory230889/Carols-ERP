import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, get, update, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, formatPrecio, qsGet, qsBuild, snapshotToEntries, snapshotToArray, toast, confirmar } from "./utils.js";

// Tipos de tela para los que existe un selector visual de colores (COLORES/{tipoDeTela}).
// Para cualquier otro tipo de tela se usa un campo de texto libre para el color.
const TELAS_CON_COLOR = [
  "Liverpool Estampado", "Canaleada de Algodón", "Liverpool Solido", "Cardigan",
  "Chol-Li", "Piel de Durazno Estampado", "Piel de Durazno Solido",
];

const codigoCliente = qsGet("tel");
const nombreCliente = qsGet("nombre");
const direccionCliente = qsGet("direccion");
const nombreVendedora = qsGet("nombreVendedora");
const telVendedora = qsGet("telVendedora");
const codVendedora = qsGet("codVendedora"); // teléfono de la vendedora (o vacío si es Carol's)
const codigoColaborador = qsGet("codigoColaborador"); // código interno, solo para PEDIDOS GLOBALES

const esCarols = nombreVendedora === "Carol´s" || nombreVendedora === "Carol's";
const destinoDePedido = esCarols ? "Pedidos Carol´s" : "Pedidos de Vendedoras";

// Si la URL trae codigoPedido, estamos AGREGANDO piezas a un pedido ya existente y cerrado
// (botón "+" de pedido-detalle.html, solo visible para el panel interno) — no se genera un
// código nuevo, no se toca "Cerrar pedido"/VENTAS GLOBALES, y se restringe la eliminación de
// otras propiedades del pedido: se limita únicamente a insertar piezas nuevas.
const codigoPedidoExistente = qsGet("codigoPedido");
const modoContinuar = Boolean(codigoPedidoExistente);
const fechaDeEntregaExistente = qsGet("fechaDeEntrega");

document.getElementById("nombre-cliente").textContent = nombreCliente || "Cliente";

if (!codigoCliente) {
  document.querySelector("main").innerHTML = '<div class="empty-state">Falta el teléfono del cliente en la URL.</div>';
  throw new Error("Falta codigoCliente");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/* ---------- Estado del pedido en curso (persistido en este navegador, solo modo "crear nuevo") ---------- */
const LS_KEY = `crearPedido_${codigoCliente}`;
function cargarEstado() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "null");
  } catch (e) {
    return null;
  }
}
function guardarEstado() {
  localStorage.setItem(LS_KEY, JSON.stringify(estado));
}

let estado = cargarEstado() || { codigoPedido: null };
let codigoPedido;
if (modoContinuar) {
  codigoPedido = codigoPedidoExistente;
  document.getElementById("link-volver").href =
    "pedido-detalle.html?" +
    qsBuild({
      codigoCliente, codigoPedido, codVendedora, nombreDeCliente: nombreCliente,
      fechaDeEntrega: fechaDeEntregaExistente, nombreVendedora, panel: "1",
    });
  document.getElementById("codigo-pedido-info").textContent = `Agregando piezas al pedido: ${codigoPedido}`;
  document.querySelector(".info-card .card-actions").hidden = true;
} else {
  if (!estado.codigoPedido) {
    const ahora = new Date();
    estado.codigoPedido = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
    guardarEstado();
  }
  codigoPedido = estado.codigoPedido;
  document.getElementById("codigo-pedido-info").textContent = `Código de pedido: ${codigoPedido}`;
  document.getElementById("link-volver").href =
    "pedidos-cliente.html?" + qsBuild({ tel: codigoCliente, nombre: nombreCliente, direccion: direccionCliente, nombreVendedora, telVendedora });
}

const RUTA_PIEZAS = `PEDIDOS/${codigoCliente}/${codigoPedido}`;
const RUTA_RESUMEN = `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}`;

// Siguiente nodoID: se calcula siempre a partir de lo que ya existe en Firebase (más robusto
// que llevar un contador local — funciona igual para un pedido nuevo o uno ya existente).
async function siguienteNodoID() {
  const snap = await get(dbRef(db, RUTA_PIEZAS));
  const entradas = snapshotToEntries(snap);
  const max = entradas.reduce((m, [k]) => Math.max(m, Number(k) || 0), 0);
  return String(max + 1);
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------- Fecha de recepción ---------- */
const inputFecha = document.getElementById("f-fecha");
if (modoContinuar) {
  // Se mantiene la misma fecha de entrega ya acordada con la clienta para este pedido.
  get(dbRef(db, `${RUTA_RESUMEN}/fechaDeRecepcion`)).then((snap) => {
    const [d, m, y] = String(snap.val() || "").split("/").map(Number);
    if (d && m && y) inputFecha.value = `${y}-${pad(m)}-${pad(d)}`;
    else inputFecha.valueAsDate = new Date();
  });
} else {
  inputFecha.valueAsDate = new Date();
}

function fechaDDMMYYYY() {
  const [y, m, d] = inputFecha.value.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

/* ---------- Método: foto propia vs catálogo ---------- */
const btnMetodoFoto = document.getElementById("btn-metodo-foto");
const btnMetodoCatalogo = document.getElementById("btn-metodo-catalogo");
const bloqueFoto = document.getElementById("bloque-foto");
const bloqueCatalogo = document.getElementById("bloque-catalogo");
let metodo = "foto";

function elegirMetodo(m) {
  metodo = m;
  bloqueFoto.hidden = m !== "foto";
  bloqueCatalogo.hidden = m !== "catalogo";
  btnMetodoFoto.classList.toggle("btn-primary", m === "foto");
  btnMetodoFoto.classList.toggle("btn-outline", m !== "foto");
  btnMetodoCatalogo.classList.toggle("btn-primary", m === "catalogo");
  btnMetodoCatalogo.classList.toggle("btn-outline", m !== "catalogo");
}
elegirMetodo("foto");
btnMetodoFoto.addEventListener("click", () => elegirMetodo("foto"));
btnMetodoCatalogo.addEventListener("click", () => elegirMetodo("catalogo"));

/* ---------- Subida de foto propia ---------- */
const preview = document.getElementById("preview-foto");
let archivoFoto = null;
document.getElementById("f-foto").addEventListener("change", (e) => {
  archivoFoto = e.target.files[0] || null;
  if (archivoFoto) {
    preview.src = URL.createObjectURL(archivoFoto);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

/* ---------- Búsqueda en catálogo ---------- */
let datosCatalogo = null; // { foto, precio1, precio2 }
document.getElementById("btn-buscar-catalogo").addEventListener("click", async () => {
  const codigo = document.getElementById("f-codigo-catalogo").value.trim();
  const errorEl = document.getElementById("error-catalogo");
  errorEl.classList.remove("visible");
  if (!codigo) return;
  const snap = await get(dbRef(db, `CATALOGO/Todas las prendas/${codigo}`));
  if (!snap.exists()) {
    datosCatalogo = null;
    errorEl.classList.add("visible");
    preview.style.display = "none";
    return;
  }
  const v = snap.val();
  datosCatalogo = { foto: v.foto || "", precio1: v.precio1 || "0", precio2: v.precio2 || "0" };
  if (datosCatalogo.foto) {
    preview.src = datosCatalogo.foto;
    preview.style.display = "block";
  }
  actualizarPrecioSegunTalla();
  toast("Prenda encontrada en el catálogo.", "success");
});

/* ---------- Talla / Tela / Color ---------- */
const fTalla = document.getElementById("f-talla");
const fTela = document.getElementById("f-tela");
const fPrecio = document.getElementById("f-precio");
const grupoColorSwatches = document.getElementById("grupo-color-swatches");
const grupoColorTexto = document.getElementById("grupo-color-texto");
const listaColores = document.getElementById("lista-colores");

function actualizarPrecioSegunTalla() {
  if (!datosCatalogo) return;
  const esGrande = fTalla.value === "XL" || fTalla.value === "XXL";
  fPrecio.value = esGrande ? datosCatalogo.precio2 : datosCatalogo.precio1;
}
fTalla.addEventListener("change", actualizarPrecioSegunTalla);

onValue(dbRef(db, "TELAS"), (snapshot) => {
  const telas = snapshotToArray(snapshot)
    .map((t) => t.descripcion)
    .filter(Boolean);
  fTela.innerHTML = '<option value="">Seleccione…</option>' + telas.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
});

let colorSeleccionado = null; // { color, codColor, imagen }

fTela.addEventListener("change", () => {
  colorSeleccionado = null;
  listaColores.innerHTML = "";
  if (TELAS_CON_COLOR.includes(fTela.value)) {
    grupoColorSwatches.hidden = false;
    grupoColorTexto.hidden = true;
    cargarColores(fTela.value);
  } else {
    grupoColorSwatches.hidden = true;
    grupoColorTexto.hidden = false;
  }
});

function cargarColores(tipoDeTela) {
  onValue(dbRef(db, `COLORES/${tipoDeTela}`), (snapshot) => {
    const colores = snapshotToArray(snapshot);
    if (!colores.length) {
      listaColores.innerHTML = '<p class="muted">Sin colores registrados para esta tela.</p>';
      return;
    }
    listaColores.innerHTML = colores
      .map(
        (c, i) => `
        <button type="button" class="btn btn-outline btn-sm" data-color-idx="${i}" style="display:flex; flex-direction:column; align-items:center; gap:4px; height:auto; padding:6px;">
          ${c.imagen ? `<img src="${c.imagen}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" />` : ""}
          <span>${escapeHtml(c.color)}</span>
        </button>`
      )
      .join("");
    listaColores.querySelectorAll("[data-color-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = colores[Number(btn.dataset.colorIdx)];
        colorSeleccionado = { color: c.color, codColor: c.codColor, imagen: c.imagen };
        listaColores.querySelectorAll("[data-color-idx]").forEach((b) => b.classList.remove("btn-primary"));
        btn.classList.add("btn-primary");
      });
    });
  });
}

/* ---------- Guardar y continuar (agregar una pieza) ---------- */
function marcarError(el, mostrar) {
  const errorText = el.parentElement.querySelector(".error-text");
  el.classList.toggle("error", mostrar);
  if (errorText) errorText.classList.toggle("visible", mostrar);
}

document.getElementById("btn-guardar-prenda").addEventListener("click", async () => {
  const especificaciones = document.getElementById("f-especificaciones").value.trim();
  const talla = fTalla.value;
  const tipoDeTela = fTela.value;
  const colorTexto = document.getElementById("f-color-texto").value.trim();
  const usaSwatches = TELAS_CON_COLOR.includes(tipoDeTela);
  const color = usaSwatches ? (colorSeleccionado ? colorSeleccionado.color : "") : colorTexto;
  const precio = fPrecio.value.trim() || "0";

  let valido = true;
  if (!inputFecha.value) { marcarError(inputFecha, true); valido = false; } else marcarError(inputFecha, false);
  marcarError(document.getElementById("f-especificaciones"), !especificaciones); if (!especificaciones) valido = false;
  marcarError(fTalla, !talla); if (!talla) valido = false;
  marcarError(fTela, !tipoDeTela); if (!tipoDeTela) valido = false;
  const colorEl = usaSwatches ? grupoColorSwatches : grupoColorTexto;
  const colorInvalido = !color;
  colorEl.querySelector(".error-text")?.classList.toggle("visible", colorInvalido);
  if (colorInvalido) valido = false;

  if (metodo === "foto" && !archivoFoto && !datosCatalogo) {
    toast("Seleccione una foto de la prenda.", "error");
    valido = false;
  }
  if (metodo === "catalogo" && !datosCatalogo) {
    toast("Busque y seleccione una prenda del catálogo.", "error");
    valido = false;
  }

  if (!valido) {
    toast("Complete todos los campos requeridos.", "error");
    return;
  }

  const btnGuardar = document.getElementById("btn-guardar-prenda");
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    let fotoUrl = "";
    if (metodo === "catalogo" && datosCatalogo) {
      fotoUrl = datosCatalogo.foto;
    } else if (archivoFoto) {
      const nombreArchivo = `img_${Date.now()}.jpg`;
      const refFoto = storageRef(storage, `Fotos Subidas/${nombreArchivo}`);
      await uploadBytes(refFoto, archivoFoto);
      fotoUrl = await getDownloadURL(refFoto);
    }

    const nodoIDstr = await siguienteNodoID();

    const fecha = fechaDDMMYYYY();

    const datosPieza = {
      foto: fotoUrl,
      especificaciones,
      talla,
      color,
      tipoDeTela,
      estampado: usaSwatches ? (colorSeleccionado ? colorSeleccionado.codColor : "ninguno") : "ninguno",
      urlEstampado: usaSwatches ? (colorSeleccionado ? colorSeleccionado.imagen : "ninguno") : "ninguno",
      fechaDeRecepcion: fecha,
      codigoDeCliente: codigoCliente,
      nombreCliente,
      precio,
      precio1: datosCatalogo ? datosCatalogo.precio1 : precio,
      precio2: datosCatalogo ? datosCatalogo.precio2 : precio,
      estatus: "cerrado",
      nodoID: nodoIDstr,
      codigoDePedido: codigoPedido,
    };

    await set(dbRef(db, `${RUTA_PIEZAS}/${nodoIDstr}`), datosPieza);
    await recalcularMonto();
    // En modo "agregar a pedido existente" no se toca el estatus (ya está "cerrado" y debe
    // seguir así) ni la fecha de recepción original — solo se refleja el nuevo último nodo.
    const datosResumen = modoContinuar
      ? { ultimoNodo: nodoIDstr }
      : {
          nombreCliente,
          fechaDeRecepcion: fecha,
          codigoDeCliente: codigoCliente,
          codigoDePedido: codigoPedido,
          estatus: "abierto",
          ultimoNodo: nodoIDstr,
        };
    await update(dbRef(db, RUTA_RESUMEN), datosResumen);

    toast(`Prenda #${nodoIDstr} agregada.`, "success");

    // Reset de los campos propios de la prenda (se conserva la fecha de recepción del pedido).
    document.getElementById("f-especificaciones").value = "";
    fTalla.value = "";
    fTela.value = "";
    document.getElementById("f-color-texto").value = "";
    fPrecio.value = "";
    document.getElementById("f-codigo-catalogo").value = "";
    document.getElementById("f-foto").value = "";
    archivoFoto = null;
    datosCatalogo = null;
    colorSeleccionado = null;
    preview.style.display = "none";
    grupoColorSwatches.hidden = true;
    grupoColorTexto.hidden = true;
    listaColores.innerHTML = "";
  } catch (e) {
    toast("Error al guardar la prenda: " + e.message, "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar y continuar";
  }
});

/* ---------- Lista de piezas del pedido (tab "Detalle del Pedido") + monto ---------- */
async function recalcularMonto() {
  const snap = await get(dbRef(db, RUTA_PIEZAS));
  const piezas = snapshotToArray(snap);
  const monto = piezas.reduce((acc, p) => acc + (Number(p.precio) || 0), 0);
  await update(dbRef(db, RUTA_RESUMEN), { monto: String(monto) });
  return monto;
}

const btnCerrarPedido = document.getElementById("btn-cerrar-pedido");

onValue(dbRef(db, RUTA_PIEZAS), (snapshot) => {
  const piezas = snapshotToEntries(snapshot);
  document.getElementById("v-cuenta-piezas").textContent = String(piezas.length);
  btnCerrarPedido.hidden = modoContinuar || piezas.length === 0;
  renderPiezas(piezas);
});

onValue(dbRef(db, `${RUTA_RESUMEN}/monto`), (snap) => {
  document.getElementById("v-monto").textContent = money(snap.val() || 0);
});

function renderPiezas(entradas) {
  const cont = document.getElementById("lista-piezas");
  if (!entradas.length) {
    cont.innerHTML = '<div class="empty-state">Aún no se han agregado prendas a este pedido.</div>';
    return;
  }
  cont.innerHTML = entradas
    .map(
      ([nodoID, p]) => `
      <div class="card">
        <div class="card-row">
          ${p.foto ? `<img class="pieza-foto" src="${p.foto}" alt="" style="width:80px;height:80px;" />` : ""}
          <div style="flex:1;">
            <h3>${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</h3>
            <p>${escapeHtml(p.tipoDeTela)}</p>
            <p>${escapeHtml(p.especificaciones)}</p>
            <p>Código: ${escapeHtml(p.codigoDePedido)}-${escapeHtml(nodoID)}</p>
          </div>
          <div style="text-align:right;">
            <div class="value">${formatPrecio(p.precio)}</div>
            <button class="btn btn-outline btn-sm" data-editar-precio="${nodoID}" style="margin-top:8px;">Editar precio</button>
          </div>
        </div>
      </div>`
    )
    .join("");

  cont.querySelectorAll("[data-editar-precio]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalPrecio(btn.dataset.editarPrecio));
  });
}

/* ---------- Editar precio de una pieza ya agregada (reemplaza AsignacionDePrecio) ---------- */
const modalPrecio = document.getElementById("modal-editar-precio");
let nodoIdEditando = null;

function abrirModalPrecio(nodoID) {
  nodoIdEditando = nodoID;
  get(dbRef(db, `${RUTA_PIEZAS}/${nodoID}/precio`)).then((snap) => {
    document.getElementById("ep-precio").value = snap.val() || "0";
  });
  modalPrecio.hidden = false;
}
document.getElementById("btn-cancelar-precio").addEventListener("click", () => (modalPrecio.hidden = true));
document.getElementById("btn-guardar-precio").addEventListener("click", async () => {
  const nuevoPrecio = document.getElementById("ep-precio").value.trim() || "0";
  try {
    await update(dbRef(db, `${RUTA_PIEZAS}/${nodoIdEditando}`), { precio: nuevoPrecio });
    await recalcularMonto();
    toast("Precio actualizado.", "success");
    modalPrecio.hidden = true;
  } catch (e) {
    toast("Error al actualizar el precio: " + e.message, "error");
  }
});

/* ---------- Cerrar pedido ---------- */
btnCerrarPedido.addEventListener("click", async () => {
  if (!confirmar("¿Desea cerrar este pedido? Ya no podrá agregar más prendas después.")) return;

  const fecha = fechaDDMMYYYY();
  const fechaDeCreacion = new Intl.DateTimeFormat("es", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(new Date());
  const ultimoNodoSnap = await get(dbRef(db, `${RUTA_RESUMEN}/ultimoNodo`));

  const registro = {
    nombreCliente,
    fechaDeCreacion,
    fechaDeRecepcion: fecha,
    codigoDeCliente: codigoCliente,
    codigoDePedido: codigoPedido,
    estatus: "cerrado",
    codVendedora: codVendedora || "",
    nombreVendedora: nombreVendedora || "",
    seo: `${nombreCliente}${codigoPedido}`,
    ultimoNodo: String(ultimoNodoSnap.val() || "0"),
  };

  try {
    await update(dbRef(db, RUTA_RESUMEN), {
      estatus: "cerrado",
      fechaDeCreacion,
      fechaDeRecepcion: fecha,
    });
    await set(dbRef(db, `VENTAS GLOBALES/${destinoDePedido}/${codigoPedido}`), registro);
    if (codigoColaborador) {
      await set(dbRef(db, `PEDIDOS GLOBALES/${destinoDePedido}/${codigoColaborador}/${codigoPedido}`), registro);
    }
    localStorage.removeItem(LS_KEY);
    toast("Pedido cerrado con éxito.", "success");
    window.location.href =
      "pedidos-cliente.html?" + qsBuild({ tel: codigoCliente, nombre: nombreCliente, direccion: direccionCliente, nombreVendedora, telVendedora });
  } catch (e) {
    toast("Error al cerrar el pedido: " + e.message, "error");
  }
});

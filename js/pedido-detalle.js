import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, get, update, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, qsGet, toast, snapshotToArray } from "./utils.js";

const codigoCliente = qsGet("codigoCliente");
const codigoPedido = qsGet("codigoPedido");
const codVendedora = qsGet("codVendedora");
const nombreVendedora = qsGet("nombreVendedora");
let nombreCliente = qsGet("nombreDeCliente");
let fechaDeEntrega = qsGet("fechaDeEntrega");

const esCarols = nombreVendedora === "Carol´s" || nombreVendedora === "Carol's";

document.getElementById("nombre-cliente").textContent = nombreCliente || "Cliente";
document.getElementById("fecha-entrega").textContent = "Fecha de entrega: " + fechaDeEntrega;
document.getElementById("link-volver").href = "ventas.html";

let montoActual = 0;
let montoTotalConEnvio = 0;
let piezasActuales = [];
let anticipoActualTotal = 0;

/* ---------- Piezas del pedido ---------- */
onValue(dbRef(db, `PEDIDOS/${codigoCliente}/${codigoPedido}`), (snapshot) => {
  piezasActuales = snapshotToArray(snapshot);
  const tbody = document.getElementById("tabla-piezas");
  if (!piezasActuales.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Sin piezas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = piezasActuales
    .map(
      (p) => `<tr>
        <td>${p.foto ? `<a href="${p.foto}" target="_blank"><img class="pieza-foto" src="${p.foto}" alt="Foto de la prenda" /></a>` : ""}</td>
        <td>${escapeHtml(p.talla)}</td>
        <td>${escapeHtml(p.color)}</td>
        <td>${escapeHtml(p.tipoDeTela)}</td>
        <td>${escapeHtml(p.especificaciones)}</td>
        <td>${escapeHtml(p.precio)}</td>
        <td>${escapeHtml(p.estatus)}</td>
      </tr>`
    )
    .join("");
});

/* ---------- Monto / anticipos / saldo ---------- */
onValue(dbRef(db, `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}`), (snapshot) => {
  if (!snapshot.exists()) return;
  const monto1 = Number(snapshot.child("monto").val() || 0);
  montoActual = monto1;
  document.getElementById("v-monto").textContent = money(monto1);

  const anticipos = Number(snapshot.child("anticipos").val() || 0);
  anticipoActualTotal = anticipos;
  document.getElementById("v-anticipos").textContent = money(anticipos);

  const montoMasEnvio = monto1 + 4.5;
  montoTotalConEnvio = montoMasEnvio;
  document.getElementById("v-monto-envio").textContent = money(montoMasEnvio);
  document.getElementById("v-saldo").textContent = money(montoMasEnvio - anticipos);
});

/* ---------- Datos del cliente (dirección) ---------- */
// Clientes de vendedoras viven anidados bajo el teléfono de la vendedora (ver README:
// "Decisiones tomadas al portar" — el nodo plano CLIENTES está vacío en la base real).
const rutaCliente = esCarols
  ? `TODOS LOS CLIENTES/CAROLS/${codigoCliente}`
  : `TODOS LOS CLIENTES/VENDEDORAS/${codVendedora}/${codigoCliente}`;
let datosCliente = {};
get(dbRef(db, rutaCliente)).then((snap) => {
  if (snap.exists()) datosCliente = snap.val();
});

document.getElementById("btn-datos-cliente").addEventListener("click", () => {
  const texto = `${nombreCliente}\n\nDirección:\n${datosCliente.direccion || "N/D"}\n\n${datosCliente.municipio || ""}, ${datosCliente.departamento || ""}\n\nTeléfono: ${codigoCliente}`;
  document.getElementById("datos-cliente-texto").textContent = texto;
  document.getElementById("modal-datos-cliente").hidden = false;
});
document.getElementById("btn-cerrar-datos").addEventListener("click", () => {
  document.getElementById("modal-datos-cliente").hidden = true;
});

/* ---------- Comisión (solo pedidos de Vendedoras) ---------- */
let montoSalario = 0;
let comisionVendedora = 0;
let estatusComisionActual = "";

async function evaluarBotonComision() {
  if (esCarols || !codVendedora) return;
  const btn = document.getElementById("btn-asignar-comision");
  if (estatusComisionActual !== "Comisión asignada") {
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
}

if (!esCarols && codVendedora) {
  get(dbRef(db, `COLABORADORES/${codVendedora}/SALARIO/monto`)).then((s) => {
    montoSalario = Number(s.val() || 0);
  });
  get(dbRef(db, `COLABORADORES/${codVendedora}/comision`)).then((s) => {
    comisionVendedora = Number(s.val() || 0);
  });
  onValue(dbRef(db, `VENTAS GLOBALES/Pedidos de Vendedoras/${codigoPedido}/estatusComision`), (s) => {
    estatusComisionActual = s.val() || "";
    evaluarBotonComision();
  });
}

document.getElementById("btn-asignar-comision").addEventListener("click", async () => {
  const montoComision = Math.round((montoActual * comisionVendedora + montoSalario) * 100) / 100;
  try {
    await update(dbRef(db, `VENTAS GLOBALES/Pedidos de Vendedoras/${codigoPedido}`), { estatusComision: "Comisión asignada" });
    await set(dbRef(db, `COLABORADORES/${codVendedora}/SALARIO`), { monto: String(montoComision) });
    toast("Comisión asignada", "success");
    document.getElementById("btn-asignar-comision").hidden = true;
  } catch (e) {
    toast("Error al asignar comisión: " + e.message, "error");
  }
});

/* ---------- Exportar a Excel ---------- */
document.getElementById("btn-exportar").addEventListener("click", () => {
  const filas = piezasActuales.map((p) => ({
    Talla: p.talla || "",
    Color: p.color || "",
    Tela: p.tipoDeTela || "",
    Cliente: nombreCliente || "",
    Vendedora: nombreVendedora || "",
    Pedido: codigoPedido || "",
    "ID prenda": `${p.codigoDePedido || codigoPedido}-${p.nodoID || ""}`,
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Pedidos");
  XLSX.writeFile(libro, `Pedido-${codigoPedido}-${nombreCliente}.xlsx`);
});

/* ---------- Anticipos ---------- */
function renderAnticipos(lista) {
  const cont = document.getElementById("lista-anticipos");
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">Sin anticipos registrados.</div>';
    return;
  }
  cont.innerHTML = lista
    .map(
      (a) => `
      <div class="anticipo-item">
        ${a.fotoComprobante ? `<a href="${a.fotoComprobante}" target="_blank"><img src="${a.fotoComprobante}" /></a>` : ""}
        <div class="meta">
          <strong>${money(a.monto)}</strong> · ${escapeHtml(a.fecha)}
        </div>
        <span class="estatus">${escapeHtml(a.estatus || "")}</span>
      </div>`
    )
    .join("");
}

onValue(dbRef(db, `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}/registroDeAnticipos`), (snapshot) => {
  renderAnticipos(snapshotToArray(snapshot));
});

const formAnticipo = document.getElementById("form-anticipo");
document.getElementById("btn-mostrar-form-anticipo").addEventListener("click", () => (formAnticipo.hidden = false));
document.getElementById("btn-cancelar-anticipo").addEventListener("click", () => (formAnticipo.hidden = true));

let archivoComprobante = null;
document.getElementById("a-foto").addEventListener("change", (e) => {
  archivoComprobante = e.target.files[0] || null;
  const preview = document.getElementById("a-preview");
  if (archivoComprobante) {
    preview.src = URL.createObjectURL(archivoComprobante);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

function pad(n) {
  return String(n).padStart(2, "0");
}

document.getElementById("btn-guardar-anticipo").addEventListener("click", async () => {
  const montoIngresado = Number(document.getElementById("a-monto").value);
  if (!montoIngresado || montoIngresado <= 0) {
    toast("Ingrese un monto válido.", "error");
    return;
  }
  if (!archivoComprobante) {
    toast("Seleccione un comprobante.", "error");
    return;
  }

  const btnGuardar = document.getElementById("btn-guardar-anticipo");
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    const ahora = new Date();
    const fecha = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()}`;
    const fechaNodo = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
    const mesFormateado = pad(ahora.getMonth() + 1);
    const periodo = `${ahora.getFullYear()}-${mesFormateado}`;
    const hora = `${fechaNodo}${ahora.getDate()}${mesFormateado}`;

    const refFoto = storageRef(storage, `ComprobantesAnticipos/${codigoCliente}/${codigoPedido}/${fechaNodo}.jpg`);
    await uploadBytes(refFoto, archivoComprobante);
    const urlFoto = await getDownloadURL(refFoto);

    const totalAnticipos = anticipoActualTotal + montoIngresado;

    await update(dbRef(db, `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}`), {
      anticipos: String(totalAnticipos),
    });

    await update(dbRef(db, `FINANZAS/Periodos/${periodo}`), { periodo });

    await set(dbRef(db, `FINANZAS/${periodo}/${hora}`), {
      fecha,
      tipo: "Entrada",
      categoria: "Anticipo",
      monto: String(montoIngresado),
      periodo,
    });

    await update(dbRef(db, `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}/registroDeAnticipos/${fechaNodo}`), {
      monto: String(montoIngresado),
      nodoID: fechaNodo,
      fecha,
      fotoComprobante: urlFoto,
      estatus: "Pendiente de Confirmacion",
    });

    toast("Anticipo registrado correctamente", "success");
    document.getElementById("a-monto").value = "";
    document.getElementById("a-preview").style.display = "none";
    archivoComprobante = null;
    formAnticipo.hidden = true;
  } catch (e) {
    toast("Error al registrar anticipo: " + e.message, "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar anticipo";
  }
});

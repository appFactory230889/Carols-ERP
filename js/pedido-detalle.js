import { db } from "./firebase-config.js";
import { ref as dbRef, onValue, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, money, formatPrecio, qsGet, qsBuild, snapshotToArray, toast } from "./utils.js";

const codigoCliente = qsGet("codigoCliente");
const codigoPedido = qsGet("codigoPedido");
const codVendedora = qsGet("codVendedora");
const nombreVendedora = qsGet("nombreVendedora");
let nombreCliente = qsGet("nombreDeCliente");
let fechaDeEntrega = qsGet("fechaDeEntrega");

const esCarols = nombreVendedora === "Carol´s" || nombreVendedora === "Carol's";

document.getElementById("nombre-cliente").textContent = nombreCliente || "Cliente";
document.getElementById("fecha-entrega").textContent = "Fecha de entrega: " + fechaDeEntrega;

// El botón "Copiar enlace" y el de "Agregar prenda" solo se muestran cuando se llega
// desde el panel interno (Ventas/Clientes agregan &panel=1 al link). Así, el link que
// le compartes al cliente no trae esa marca y estos botones no aparecen en su versión.
if (qsGet("panel") === "1") {
  document.getElementById("btn-copiar-enlace").hidden = false;

  const btnAgregarPrenda = document.getElementById("btn-agregar-prenda");
  btnAgregarPrenda.hidden = false;
  btnAgregarPrenda.href =
    "crear-pedido.html?" +
    qsBuild({
      tel: codigoCliente,
      nombre: nombreCliente,
      nombreVendedora,
      codVendedora,
      fechaDeEntrega,
      codigoPedido, // presencia de este parámetro = modo "agregar piezas a un pedido ya existente"
    });
}

function urlParaCompartir() {
  const url = new URL(window.location.href);
  url.searchParams.delete("panel");
  return url.toString();
}

function copiarConFallback(texto) {
  const textarea = document.createElement("textarea");
  textarea.value = texto;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

document.getElementById("btn-copiar-enlace").addEventListener("click", async () => {
  const url = urlParaCompartir();
  try {
    await navigator.clipboard.writeText(url);
    toast("Enlace copiado. Pégalo en WhatsApp para enviárselo al cliente.", "success");
    return;
  } catch (e) {
    // Algunos navegadores (Safari en iOS, WebViews embebidos) bloquean la API moderna:
    // se intenta con el método clásico antes de rendirse.
  }
  if (copiarConFallback(url)) {
    toast("Enlace copiado. Pégalo en WhatsApp para enviárselo al cliente.", "success");
  } else {
    window.prompt("Copia este enlace manualmente:", url);
  }
});

/* ---------- Piezas del pedido ---------- */
onValue(dbRef(db, `PEDIDOS/${codigoCliente}/${codigoPedido}`), (snapshot) => {
  const piezas = snapshotToArray(snapshot);
  const tbody = document.getElementById("tabla-piezas");
  if (!piezas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin piezas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = piezas
    .map(
      (p) => `<tr>
        <td>${p.foto ? `<a href="${p.foto}" target="_blank"><img class="pieza-foto" src="${p.foto}" alt="Foto de la prenda" /></a>` : ""}</td>
        <td>${formatPrecio(p.precio)}</td>
        <td>${escapeHtml(p.talla)}</td>
        <td>${escapeHtml(p.color)}</td>
        <td>${escapeHtml(p.tipoDeTela)}</td>
        <td>${escapeHtml(p.especificaciones)}</td>
      </tr>`
    )
    .join("");
});

/* ---------- Monto / anticipos / saldo ---------- */
onValue(dbRef(db, `PEDIDOS/${codigoCliente}/mis pedidos/${codigoPedido}`), (snapshot) => {
  if (!snapshot.exists()) return;
  const monto1 = Number(snapshot.child("monto").val() || 0);
  document.getElementById("v-monto").textContent = money(monto1);

  const anticipos = Number(snapshot.child("anticipos").val() || 0);
  document.getElementById("v-anticipos").textContent = money(anticipos);

  const montoMasEnvio = monto1 + 4.5;
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

/* ---------- Anticipos (solo lectura) ---------- */
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

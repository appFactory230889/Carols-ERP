import { db } from "./firebase-config.js";
import { ref as dbRef, onValue, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, money, qsGet, snapshotToArray } from "./utils.js";

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
        <td>${escapeHtml(p.talla)}</td>
        <td>${escapeHtml(p.color)}</td>
        <td>${escapeHtml(p.tipoDeTela)}</td>
        <td>${escapeHtml(p.especificaciones)}</td>
        <td>${escapeHtml(p.precio)}</td>
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

import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, urgencyClass, qsGet, qsBuild, snapshotToArray } from "./utils.js";

const tel = qsGet("tel");
const nombre = qsGet("nombre");
const direccion = qsGet("direccion");
const nombreVendedora = qsGet("nombreVendedora");
const telVendedora = qsGet("telVendedora");
const codVendedora = qsGet("codVendedora");
const codigoColaborador = qsGet("codigoColaborador");

document.getElementById("nombre-cliente").textContent = nombre || "Cliente";
document.getElementById("direccion-cliente").textContent = direccion || "";
document.getElementById("telefono-cliente").textContent = "teléfono: " + tel;

document.getElementById("btn-crear-pedido").href =
  "crear-pedido.html?" +
  qsBuild({
    tel, nombre, direccion, nombreVendedora, telVendedora, codVendedora, codigoColaborador,
  });

function render(pedidos) {
  const cont = document.getElementById("lista-pedidos");
  if (!pedidos.length) {
    cont.innerHTML = '<div class="empty-state">Este cliente no tiene pedidos registrados.</div>';
    return;
  }
  cont.innerHTML = pedidos
    .map((p) => {
      const clase = urgencyClass(p.fechaDeRecepcion);
      const params = qsBuild({
        codigoCliente: p.codigoDeCliente || tel,
        codigoPedido: p.codigoDePedido,
        codVendedora: p.codVendedora || telVendedora,
        nombreDeCliente: p.nombreCliente,
        fechaDeEntrega: p.fechaDeRecepcion,
        nombreVendedora: p.nombreVendedora || nombreVendedora,
        panel: "1",
      });
      return `
      <div class="card ${clase}">
        <div class="card-row">
          <div>
            <h3>Pedido ${escapeHtml(p.codigoDePedido)}</h3>
            <p>Creación: ${escapeHtml(p.fechaDeCreacion)} · Entrega: ${escapeHtml(p.fechaDeRecepcion)}</p>
          </div>
          <span class="badge">${escapeHtml(p.estatus || "")}</span>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="pedido-detalle.html?${params}">Ver detalles</a>
        </div>
      </div>`;
    })
    .join("");
}

if (tel) {
  onValue(ref(db, `PEDIDOS/${tel}/mis pedidos`), (snapshot) => {
    render(snapshotToArray(snapshot));
  });
} else {
  document.getElementById("lista-pedidos").innerHTML = '<div class="empty-state">Falta el teléfono del cliente en la URL.</div>';
}

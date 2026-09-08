import { db } from "./firebase-config.js";
import { ref, onValue, remove } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { escapeHtml, urgencyClass, qsBuild, toast, confirmar, snapshotToArray } from "./utils.js";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });
});

function renderLista(contenedorId, pedidos, rutaNodo) {
  const cont = document.getElementById(contenedorId);
  if (!pedidos.length) {
    cont.innerHTML = '<div class="empty-state">No hay pedidos registrados.</div>';
    return;
  }
  cont.innerHTML = pedidos
    .map((p) => {
      const clase = urgencyClass(p.fechaDeRecepcion);
      const params = qsBuild({
        codigoCliente: p.codigoDeCliente,
        codigoPedido: p.codigoDePedido,
        codVendedora: p.codVendedora,
        nombreDeCliente: p.nombreCliente,
        fechaDeEntrega: p.fechaDeRecepcion,
        nombreVendedora: p.nombreVendedora,
        panel: "1",
      });
      return `
      <div class="card ${clase}">
        <div class="card-row">
          <div>
            <h3>${escapeHtml(p.nombreCliente)}</h3>
            <p>Código: ${escapeHtml(p.codigoDePedido)}</p>
            <p>Creación: ${escapeHtml(p.fechaDeCreacion)} · Entrega: ${escapeHtml(p.fechaDeRecepcion)}</p>
            <p>Vendedora: ${escapeHtml(p.nombreVendedora)}</p>
          </div>
          <span class="badge">${escapeHtml(p.estatus || "")}</span>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="pedido-detalle.html?${params}">Detalles</a>
          <button class="btn btn-danger btn-sm" data-eliminar="${encodeURIComponent(p.codigoDePedido)}" data-ruta="${encodeURIComponent(rutaNodo)}">Eliminar</button>
        </div>
      </div>`;
    })
    .join("");

  cont.querySelectorAll("[data-eliminar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirmar("¿Desea eliminar este pedido del listado?")) return;
      const codigo = decodeURIComponent(btn.dataset.eliminar);
      const ruta = decodeURIComponent(btn.dataset.ruta);
      try {
        await remove(ref(db, `${ruta}/${codigo}`));
        toast("Pedido eliminado con éxito", "success");
      } catch (e) {
        toast("Error al eliminar: " + e.message, "error");
      }
    });
  });
}

function escucharPedidos(rutaNodo, contenedorId) {
  onValue(ref(db, rutaNodo), (snapshot) => {
    renderLista(contenedorId, snapshotToArray(snapshot), rutaNodo);
  });
}

escucharPedidos("VENTAS GLOBALES/Pedidos Carol´s", "lista-carols");
escucharPedidos("VENTAS GLOBALES/Pedidos de Vendedoras", "lista-vendedoras");

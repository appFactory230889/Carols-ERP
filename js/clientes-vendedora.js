import { db } from "./firebase-config.js";
import { ref, onValue, update, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { DEPARTAMENTOS, MUNICIPIOS_POR_DEPARTAMENTO } from "./ubicaciones.js";
import { escapeHtml, qsBuild, qsGet, limpiarTelefono, toast, snapshotToEntries } from "./utils.js";

const telVendedora = qsGet("tel");
const nombreVendedora = qsGet("nombre");
const codigoVendedora = qsGet("codigo");

const RUTA_CLIENTES = `TODOS LOS CLIENTES/VENDEDORAS/${telVendedora}`;

document.getElementById("nombre-vendedora").textContent = nombreVendedora || "Vendedora";

let clientes = [];

function renderLista(lista) {
  const cont = document.getElementById("lista-clientes");
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">Esta vendedora no tiene clientes registrados.</div>';
    return;
  }
  cont.innerHTML = lista
    .map((c, i) => {
      const params = qsBuild({
        tel: c.telefono,
        nombre: c.nombre,
        direccion: c.direccionCompleta,
        nombreVendedora: c.nombreVendedor || nombreVendedora,
        telVendedora: c.telVendedor || telVendedora,
        // codVendedora = teléfono de la vendedora (así se guarda en los pedidos, ver pedido-detalle.js);
        // codigoColaborador = código interno (ej. "122957"), solo se usa para PEDIDOS GLOBALES al crear un pedido.
        codVendedora: c.telVendedor || telVendedora,
        codigoColaborador: codigoVendedora,
      });
      return `
      <div class="card">
        <div class="card-row">
          <div>
            <h3>${escapeHtml(c.nombre)}</h3>
            <p>${escapeHtml(c.direccionCompleta)}</p>
            <p>Tel: ${escapeHtml(c.telefono)}</p>
          </div>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="pedidos-cliente.html?${params}">Ver pedidos</a>
          <button class="btn btn-outline btn-sm" data-editar-idx="${i}">Editar dirección</button>
        </div>
      </div>`;
    })
    .join("");

  cont.querySelectorAll("[data-editar-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalEditar(lista[Number(btn.dataset.editarIdx)]);
    });
  });
}

function filtrar(lista, texto) {
  const t = texto.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((c) => (c.seo || "").toLowerCase().includes(t));
}

document.getElementById("buscar-cliente").addEventListener("input", (e) => {
  renderLista(filtrar(clientes, e.target.value));
});

if (telVendedora) {
  onValue(ref(db, RUTA_CLIENTES), (snapshot) => {
    clientes = snapshotToEntries(snapshot).map(([key, c]) => {
      c._telefono = key;
      return c;
    });
    renderLista(filtrar(clientes, document.getElementById("buscar-cliente").value));
  });
} else {
  document.getElementById("lista-clientes").innerHTML = '<div class="empty-state">Falta el teléfono de la vendedora en la URL.</div>';
}

/* ---------- Selects Departamento / Municipio ---------- */
function llenarDepartamentos(select) {
  select.innerHTML = '<option value="">Seleccione…</option>' + DEPARTAMENTOS.map((d) => `<option value="${d}">${d}</option>`).join("");
}
function llenarMunicipios(select, departamento) {
  const municipios = MUNICIPIOS_POR_DEPARTAMENTO[departamento] || [];
  select.innerHTML = '<option value="">Seleccione…</option>' + municipios.map((m) => `<option value="${m}">${m}</option>`).join("");
}

const fDepartamento = document.getElementById("f-departamento");
const fMunicipio = document.getElementById("f-municipio");
llenarDepartamentos(fDepartamento);
fDepartamento.addEventListener("change", () => llenarMunicipios(fMunicipio, fDepartamento.value));

const eDepartamento = document.getElementById("e-departamento");
const eMunicipio = document.getElementById("e-municipio");
llenarDepartamentos(eDepartamento);
eDepartamento.addEventListener("change", () => llenarMunicipios(eMunicipio, eDepartamento.value));

/* ---------- Modal agregar cliente ---------- */
const modalCliente = document.getElementById("modal-cliente");
const formCliente = document.getElementById("form-cliente");

document.getElementById("btn-agregar").addEventListener("click", () => {
  formCliente.reset();
  llenarMunicipios(fMunicipio, "");
  document.querySelectorAll("#form-cliente .error-text, #form-cliente input, #form-cliente select").forEach((el) => el.classList.remove("visible", "error"));
  modalCliente.hidden = false;
});

document.getElementById("btn-cancelar-cliente").addEventListener("click", () => (modalCliente.hidden = true));

function marcarError(inputId, mostrar) {
  const input = document.getElementById(inputId);
  const errorText = input.parentElement.querySelector(".error-text");
  input.classList.toggle("error", mostrar);
  if (errorText) errorText.classList.toggle("visible", mostrar);
  if (mostrar) {
    input.classList.remove("error");
    void input.offsetWidth;
    input.classList.add("error");
  }
}

formCliente.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("f-nombre").value.trim();
  const direccion = document.getElementById("f-direccion").value.trim();
  const telefono = document.getElementById("f-telefono").value.trim();
  const departamento = fDepartamento.value;
  const municipio = fMunicipio.value;

  let valido = true;
  marcarError("f-nombre", !nombre); if (!nombre) valido = false;
  marcarError("f-direccion", !direccion); if (!direccion) valido = false;
  marcarError("f-telefono", !telefono); if (!telefono) valido = false;
  marcarError("f-departamento", !departamento); if (!departamento) valido = false;
  marcarError("f-municipio", !municipio); if (!municipio) valido = false;
  if (!valido) {
    toast("Complete todos los campos requeridos.", "error");
    return;
  }

  const telFiltrado = limpiarTelefono(telefono);
  const direccionCompleta = `${direccion}, ${municipio}, ${departamento}`;
  const seo = `${nombre}${municipio}${departamento}`;

  const datosCliente = {
    nombre, direccion, direccionCompleta,
    telefono: telFiltrado,
    codigoVendedor: codigoVendedora,
    telVendedor: telVendedora,
    nombreVendedor: nombreVendedora,
    departamento, municipio, seo,
  };

  try {
    await set(ref(db, `${RUTA_CLIENTES}/${telFiltrado}`), datosCliente);
    toast("Los datos se guardaron con éxito", "success");
    modalCliente.hidden = true;
  } catch (err) {
    toast("Error al guardar: " + err.message, "error");
  }
});

/* ---------- Modal editar dirección ---------- */
const modalEditar = document.getElementById("modal-editar");
let editarContexto = null;

function abrirModalEditar(cliente) {
  editarContexto = { telefono: cliente._telefono };
  document.getElementById("e-nombre").value = cliente.nombre || "";
  document.getElementById("e-telefono").value = cliente.telefono || "";
  document.getElementById("e-direccion").value = cliente.direccion || "";
  llenarMunicipios(eMunicipio, cliente.departamento || "");
  eDepartamento.value = cliente.departamento || "";
  eMunicipio.value = cliente.municipio || "";
  modalEditar.hidden = false;
}

document.getElementById("btn-cancelar-editar").addEventListener("click", () => (modalEditar.hidden = true));

document.getElementById("btn-guardar-editar").addEventListener("click", async () => {
  if (!editarContexto) return;
  const direccion = document.getElementById("e-direccion").value.trim();
  const departamento = eDepartamento.value;
  const municipio = eMunicipio.value;
  if (!direccion || !departamento || !municipio) {
    toast("Complete dirección, departamento y municipio.", "error");
    return;
  }
  const direccionCompleta = `${direccion}, ${municipio}, ${departamento}`;
  try {
    await update(ref(db, `${RUTA_CLIENTES}/${editarContexto.telefono}`), {
      direccion, direccionCompleta, departamento, municipio,
    });
    toast("Los datos se guardaron con éxito", "success");
    modalEditar.hidden = true;
  } catch (err) {
    toast("Error al guardar: " + err.message, "error");
  }
});

import { db } from "./firebase-config.js";
import { ref, onValue, update, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { DEPARTAMENTOS, MUNICIPIOS_POR_DEPARTAMENTO } from "./ubicaciones.js";
import { escapeHtml, qsBuild, limpiarTelefono, toast } from "./utils.js";

// Rutas Firebase:
// - Clientes Carol's: TODOS LOS CLIENTES/CAROLS/{telefono}  (igual que en la app Android)
// - Clientes Vendedoras: TODOS LOS CLIENTES/VENDEDORAS/{telVendedora}/{telCliente}  (anidado por
//   vendedora). NOTA: ClientesVendedoraFragment en la app Android lee de un nodo plano "CLIENTES",
//   pero se confirmó contra la base de datos real que ese nodo está vacío — todos los clientes de
//   vendedoras viven anidados aquí (donde sí escribe AgregarClienteDeVendedora). Por eso la web lee
//   y escribe en esta ruta anidada, para mostrar los datos reales.
const RUTA_CAROLS = "TODOS LOS CLIENTES/CAROLS";
const RUTA_VENDEDORAS_RAIZ = "TODOS LOS CLIENTES/VENDEDORAS";

let clientesCarols = [];
let clientesVendedoras = [];
let tabActiva = "carols";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    tabActiva = btn.dataset.tab;
  });
});

function renderLista(contenedorId, lista) {
  const cont = document.getElementById(contenedorId);
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">No hay clientes registrados.</div>';
    return;
  }
  cont.innerHTML = lista
    .map((c, i) => {
      const params = qsBuild({
        tel: c.telefono,
        nombre: c.nombre,
        direccion: c.direccionCompleta,
        nombreVendedora: c.nombreVendedor,
        telVendedora: c.telVendedor,
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
      const cliente = lista[Number(btn.dataset.editarIdx)];
      abrirModalEditar(cliente, cliente._ruta);
    });
  });
}

function filtrar(lista, texto) {
  const t = texto.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((c) => (c.seo || "").toLowerCase().includes(t));
}

document.getElementById("buscar-carols").addEventListener("input", (e) => {
  renderLista("lista-carols", filtrar(clientesCarols, e.target.value));
});
document.getElementById("buscar-vendedoras").addEventListener("input", (e) => {
  renderLista("lista-vendedoras", filtrar(clientesVendedoras, e.target.value));
});

onValue(ref(db, RUTA_CAROLS), (snapshot) => {
  clientesCarols = [];
  snapshot.forEach((child) => {
    const c = child.val();
    c._ruta = `${RUTA_CAROLS}/${child.key}`;
    clientesCarols.push(c);
  });
  renderLista("lista-carols", filtrar(clientesCarols, document.getElementById("buscar-carols").value));
});

onValue(ref(db, RUTA_VENDEDORAS_RAIZ), (snapshot) => {
  clientesVendedoras = [];
  snapshot.forEach((vendedoraSnap) => {
    vendedoraSnap.forEach((clienteSnap) => {
      const c = clienteSnap.val();
      c._ruta = `${RUTA_VENDEDORAS_RAIZ}/${vendedoraSnap.key}/${clienteSnap.key}`;
      clientesVendedoras.push(c);
    });
  });
  renderLista("lista-vendedoras", filtrar(clientesVendedoras, document.getElementById("buscar-vendedoras").value));
});

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
const grupoVendedora = document.getElementById("grupo-vendedora");

document.getElementById("btn-agregar").addEventListener("click", () => {
  formCliente.reset();
  llenarMunicipios(fMunicipio, "");
  document.querySelectorAll("#form-cliente .error-text, #form-cliente input, #form-cliente select").forEach((el) => el.classList.remove("visible", "error"));
  grupoVendedora.hidden = tabActiva !== "vendedoras";
  document.getElementById("modal-titulo").textContent = tabActiva === "carols" ? "Agregar cliente Carol´s" : "Agregar cliente de vendedora";
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

  let datosCliente, ruta;
  if (tabActiva === "carols") {
    datosCliente = {
      nombre, direccion, direccionCompleta,
      telefono: telFiltrado,
      codigoVendedor: "Carol´s",
      nombreVendedor: "Carol´s",
      departamento, municipio, seo,
    };
    ruta = `${RUTA_CAROLS}/${telFiltrado}`;
  } else {
    const nombreVendedora = document.getElementById("f-nombre-vendedora").value.trim();
    const telVendedora = limpiarTelefono(document.getElementById("f-tel-vendedora").value.trim());
    if (!telVendedora) {
      toast("Ingrese el teléfono de la vendedora.", "error");
      return;
    }
    datosCliente = {
      nombre, direccion, direccionCompleta,
      telefono: telFiltrado,
      codigoVendedor: telVendedora,
      telVendedor: telVendedora,
      nombreVendedor: nombreVendedora,
      departamento, municipio, seo,
    };
    ruta = `${RUTA_VENDEDORAS_RAIZ}/${telVendedora}/${telFiltrado}`;
  }

  try {
    await set(ref(db, ruta), datosCliente);
    toast("Los datos se guardaron con éxito", "success");
    modalCliente.hidden = true;
  } catch (err) {
    toast("Error al guardar: " + err.message, "error");
  }
});

/* ---------- Modal editar dirección ---------- */
const modalEditar = document.getElementById("modal-editar");
let editarContexto = null;

function abrirModalEditar(cliente, ruta) {
  editarContexto = { ruta };
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
    await update(ref(db, editarContexto.ruta), {
      direccion, direccionCompleta, departamento, municipio,
    });
    toast("Los datos se guardaron con éxito", "success");
    modalEditar.hidden = true;
  } catch (err) {
    toast("Error al guardar: " + err.message, "error");
  }
});

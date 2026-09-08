export function qsGet(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function qsBuild(params) {
  const clean = {};
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) clean[k] = params[k];
  });
  return new URLSearchParams(clean).toString();
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function money(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return "$0.00";
  return "$" + v.toFixed(2);
}

// Como money(), pero sin ".00" cuando el precio es un número entero (ej. "$5" en vez de "$5.00").
export function formatPrecio(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return escapeHtml(n);
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

export function parseFechaDDMMYYYY(str) {
  if (!str) return null;
  const partes = str.trim().split("/");
  if (partes.length !== 3) return null;
  const [d, m, y] = partes.map(Number);
  if (!d || !m || !y) return null;
  const fecha = new Date(y, m - 1, d);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

// Replica el resaltado por urgencia de PedidoClienteAdapter/HistorialAdapter:
// 1 día antes = rojo, 2 días = amarillo, 3 días = verde.
export function urgencyClass(fechaEntregaStr) {
  const fecha = parseFechaDDMMYYYY(fechaEntregaStr);
  if (!fecha) return "";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffDias = Math.round((fecha - hoy) / 86400000);
  if (diffDias === 1) return "urgencia-roja";
  if (diffDias === 2) return "urgencia-amarilla";
  if (diffDias === 3) return "urgencia-verde";
  return "";
}

// Mismo criterio que AgregarClienteCarols/AgregarClienteDeVendedora para usar el
// teléfono normalizado como key del nodo del cliente en Firebase.
export function limpiarTelefono(tel) {
  return (tel || "").replace("+503", "").replace(/\s/g, "").replace(/-/g, "").trim();
}

export function toast(msg, tipo = "info") {
  let cont = document.getElementById("toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toast-container";
    document.body.appendChild(cont);
  }
  const el = document.createElement("div");
  el.className = "toast toast-" + tipo;
  el.textContent = msg;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

export function confirmar(mensaje) {
  return window.confirm(mensaje);
}

// Cuando las keys de los hijos de un nodo son enteros pequeños y consecutivos
// (ej. nodoID "1", "2"), Firebase representa internamente el nodo como un arreglo
// con huecos null (ej. [null, pieza1, pieza2]), y snapshot.forEach() puede quedarse
// solo con el primer hijo real. Por eso, para listar hijos de un nodo, usamos val()
// directamente y normalizamos ambas formas (arreglo con huecos u objeto normal).
// Normaliza el valor de un nodo Firebase (objeto normal, o arreglo con huecos
// null cuando las keys son enteros pequeños y consecutivos) a pares [key, valor].
export function entriesFromValue(val) {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) {
    return val
      .map((v, i) => [String(i), v])
      .filter(([, v]) => v !== null && v !== undefined);
  }
  return Object.entries(val);
}

export function snapshotToArray(snapshot) {
  return entriesFromValue(snapshot.val()).map(([, v]) => v);
}

// Igual que snapshotToArray, pero conservando la key de cada hijo (ej. para
// reconstruir la ruta de Firebase de cada registro).
export function snapshotToEntries(snapshot) {
  return entriesFromValue(snapshot.val());
}

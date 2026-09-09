import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, get, set, update } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, formatPrecio, qsGet, qsBuild, snapshotToEntries, toast } from "./utils.js";

const codAcreedor = qsGet("cod");
const nombreAcreedor = qsGet("nombre");
const logoAcreedor = qsGet("logo");

const RUTA_ACREEDOR = `CREDITOS/ACREEDORES/${codAcreedor}`;
const RUTA_CREDITOS = `${RUTA_ACREEDOR}/historialCreditos`;

document.getElementById("nombre-acreedor").textContent = nombreAcreedor || "Acreedor";
if (logoAcreedor) {
  const img = document.getElementById("img-acreedor");
  img.src = logoAcreedor;
  img.style.display = "block";
}

if (!codAcreedor) {
  document.querySelector("main").innerHTML = '<div class="empty-state">Falta el acreedor en la URL.</div>';
  throw new Error("Falta codAcreedor");
}

// El saldo pendiente de cada crédito y la deuda total del acreedor se recalculan
// siempre desde los datos reales (monto solicitado - suma de abonos), en vez de
// depender de un campo que alguien tiene que recordar actualizar a mano — así se
// evita el bug que tenía la app Android (el saldo nunca bajaba al abonar).
function saldoDelCredito(credito) {
  const abonos = credito.abonos ? Object.values(credito.abonos) : [];
  const totalAbonado = abonos.reduce((acc, a) => acc + (Number(a.monto) || 0), 0);
  return (Number(credito.montoSolicitado) || 0) - totalAbonado;
}

onValue(dbRef(db, RUTA_CREDITOS), (snapshot) => {
  const creditos = snapshotToEntries(snapshot).map(([codigoDeCredito, c]) => ({ codigoDeCredito, ...c }));
  renderCreditos(creditos);

  const saldoTotal = creditos.reduce((acc, c) => acc + saldoDelCredito(c), 0);
  document.getElementById("v-saldo-total").textContent = money(saldoTotal);
  update(dbRef(db, RUTA_ACREEDOR), { deudaTotal: String(saldoTotal) });
});

function renderCreditos(lista) {
  const cont = document.getElementById("lista-creditos");
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">Sin créditos registrados con este acreedor.</div>';
    return;
  }
  const ordenada = [...lista].sort((a, b) => Number(b.codigoDeCredito) - Number(a.codigoDeCredito));
  cont.innerHTML = ordenada
    .map((c) => {
      const saldo = saldoDelCredito(c);
      const params = qsBuild({ cod: codAcreedor, nombre: nombreAcreedor, codCredito: c.codigoDeCredito });
      return `
      <div class="card">
        <div class="card-row">
          <div>
            <h3>${formatPrecio(c.montoSolicitado)} solicitado</h3>
            <p>Adquirido: ${escapeHtml(c.fechaDeAdquicisionDeDeuda || "N/D")} · Límite: ${escapeHtml(c.fechaLimiteDePago || "N/D")}</p>
            ${c.fotoFactura ? `<p><a href="${c.fotoFactura}" target="_blank">Ver factura</a></p>` : ""}
          </div>
          <div style="text-align:right;">
            <div class="value" style="color:${saldo > 0 ? "var(--rojo)" : "var(--verde)"};">${money(saldo)}</div>
            <p class="muted" style="font-size:0.75rem;">saldo</p>
          </div>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="creditos-abonos.html?${params}">Ver abonos</a>
        </div>
      </div>`;
    })
    .join("");
}

/* ---------- Agregar crédito ---------- */
const modal = document.getElementById("modal-credito");
let archivo = null;

document.getElementById("btn-agregar").addEventListener("click", () => {
  document.getElementById("c-monto").value = "";
  document.getElementById("c-fecha-adquisicion").valueAsDate = new Date();
  document.getElementById("c-fecha-limite").value = "";
  document.getElementById("c-foto").value = "";
  document.getElementById("c-preview").style.display = "none";
  document.querySelectorAll("#modal-credito .error-text").forEach((el) => el.classList.remove("visible"));
  archivo = null;
  modal.hidden = false;
});
document.getElementById("btn-cancelar-credito").addEventListener("click", () => (modal.hidden = true));

document.getElementById("c-foto").addEventListener("change", (e) => {
  archivo = e.target.files[0] || null;
  const preview = document.getElementById("c-preview");
  if (archivo) {
    preview.src = URL.createObjectURL(archivo);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

function ddmmyyyy(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

document.getElementById("btn-guardar-credito").addEventListener("click", async () => {
  const monto = document.getElementById("c-monto").value.trim();
  const errorEl = document.querySelector("#modal-credito .error-text");
  const invalido = !monto || Number(monto) <= 0;
  errorEl.classList.toggle("visible", invalido);
  if (invalido) {
    toast("Ingrese un monto válido.", "error");
    return;
  }

  const btn = document.getElementById("btn-guardar-credito");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const codigoDeCredito = String(Date.now());

    let urlFactura = "";
    if (archivo) {
      const refFoto = storageRef(storage, `ACREEDORES_IMG/facturas/${codAcreedor}/${codigoDeCredito}.jpg`);
      await uploadBytes(refFoto, archivo);
      urlFactura = await getDownloadURL(refFoto);
    }

    await set(dbRef(db, `${RUTA_CREDITOS}/${codigoDeCredito}`), {
      codigoDeCredito,
      codAcreedor,
      montoSolicitado: monto,
      fechaDeAdquicisionDeDeuda: ddmmyyyy(document.getElementById("c-fecha-adquisicion").value),
      fechaLimiteDePago: ddmmyyyy(document.getElementById("c-fecha-limite").value),
      fotoFactura: urlFactura,
    });

    toast("Crédito registrado con éxito.", "success");
    modal.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

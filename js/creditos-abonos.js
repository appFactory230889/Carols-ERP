import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, qsGet, qsBuild, snapshotToEntries, toast } from "./utils.js";

const codAcreedor = qsGet("cod");
const nombreAcreedor = qsGet("nombre");
const codCredito = qsGet("codCredito");

const RUTA_CREDITO = `CREDITOS/ACREEDORES/${codAcreedor}/historialCreditos/${codCredito}`;

document.getElementById("nombre-acreedor").textContent = nombreAcreedor || "Acreedor";
document.getElementById("link-volver").href = "creditos-detalle.html?" + qsBuild({ cod: codAcreedor, nombre: nombreAcreedor });

if (!codAcreedor || !codCredito) {
  document.querySelector("main").innerHTML = '<div class="empty-state">Falta información en la URL.</div>';
  throw new Error("Falta codAcreedor/codCredito");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

let montoSolicitado = 0;

onValue(dbRef(db, RUTA_CREDITO), (snapshot) => {
  const credito = snapshot.val() || {};
  montoSolicitado = Number(credito.montoSolicitado) || 0;
  document.getElementById("v-monto").textContent = money(montoSolicitado);

  const abonosEntradas = snapshotToEntries({ val: () => credito.abonos });
  const totalAbonado = abonosEntradas.reduce((acc, [, a]) => acc + (Number(a.monto) || 0), 0);
  document.getElementById("v-abonado").textContent = money(totalAbonado);
  document.getElementById("v-saldo").textContent = money(montoSolicitado - totalAbonado);

  renderAbonos(abonosEntradas);
});

function renderAbonos(entradas) {
  const cont = document.getElementById("lista-abonos");
  if (!entradas.length) {
    cont.innerHTML = '<div class="empty-state">Sin abonos registrados todavía.</div>';
    return;
  }
  const ordenada = [...entradas].sort((a, b) => b[0].localeCompare(a[0]));
  cont.innerHTML = ordenada
    .map(
      ([, a]) => `
      <div class="anticipo-item">
        ${a.fotoComprobante ? `<a href="${a.fotoComprobante}" target="_blank"><img src="${a.fotoComprobante}" /></a>` : ""}
        <div class="meta">
          <strong>${money(a.monto)}</strong> · ${escapeHtml(a.fecha)}
        </div>
      </div>`
    )
    .join("");
}

/* ---------- Registrar abono ---------- */
const formAbono = document.getElementById("form-abono");
document.getElementById("btn-mostrar-form").addEventListener("click", () => (formAbono.hidden = false));
document.getElementById("btn-cancelar-abono").addEventListener("click", () => (formAbono.hidden = true));

let archivoComprobante = null;
document.getElementById("ab-foto").addEventListener("change", (e) => {
  archivoComprobante = e.target.files[0] || null;
  const preview = document.getElementById("ab-preview");
  if (archivoComprobante) {
    preview.src = URL.createObjectURL(archivoComprobante);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

document.getElementById("btn-guardar-abono").addEventListener("click", async () => {
  const montoIngresado = Number(document.getElementById("ab-monto").value);
  if (!montoIngresado || montoIngresado <= 0) {
    toast("Ingrese un monto válido.", "error");
    return;
  }
  if (!archivoComprobante) {
    toast("Seleccione un comprobante.", "error");
    return;
  }

  const btn = document.getElementById("btn-guardar-abono");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const ahora = new Date();
    const fecha = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()}`;
    const periodo = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}`;
    const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;

    const abonoKey = push(dbRef(db, `${RUTA_CREDITO}/abonos`)).key;
    const refFoto = storageRef(storage, `ACREEDORES_IMG/abonos/${codAcreedor}/${codCredito}/${abonoKey}.jpg`);
    await uploadBytes(refFoto, archivoComprobante);
    const urlFoto = await getDownloadURL(refFoto);

    await set(dbRef(db, `${RUTA_CREDITO}/abonos/${abonoKey}`), {
      monto: String(montoIngresado),
      fecha,
      fotoComprobante: urlFoto,
    });

    // A diferencia de la app Android (que registraba esto como "Entrada"/"Anticipo" por error,
    // copiado del flujo de anticipos de clientes), un abono a un proveedor es dinero que SALE
    // de la empresa — se refleja como Salida en el módulo de Finanzas para que cuadre.
    await update(dbRef(db, `FINANZAS/Periodos/${periodo}`), { periodo });
    await set(dbRef(db, `FINANZAS/${periodo}/${hora}`), {
      fecha,
      tipo: "Salida",
      categoria: "Abono a Credito",
      monto: String(montoIngresado),
      periodo,
    });

    toast("Abono registrado correctamente.", "success");
    document.getElementById("ab-monto").value = "";
    document.getElementById("ab-preview").style.display = "none";
    archivoComprobante = null;
    formAbono.hidden = true;
  } catch (e) {
    toast("Error al registrar el abono: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar abono";
  }
});

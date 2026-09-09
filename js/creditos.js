import { db, storage } from "./firebase-config.js";
import { ref as dbRef, onValue, set } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { escapeHtml, money, qsBuild, snapshotToEntries, toast } from "./utils.js";

const RUTA = "CREDITOS/ACREEDORES";

onValue(dbRef(db, RUTA), (snapshot) => {
  const acreedores = snapshotToEntries(snapshot).map(([codAcreedor, a]) => ({ codAcreedor, ...a }));
  renderAcreedores(acreedores);
  const deudaTotal = acreedores.reduce((acc, a) => acc + (Number(a.deudaTotal) || 0), 0);
  document.getElementById("v-deuda-total").textContent = money(deudaTotal);
});

function renderAcreedores(lista) {
  const cont = document.getElementById("lista-acreedores");
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state">No hay acreedores registrados.</div>';
    return;
  }
  cont.innerHTML = lista
    .map((a) => {
      const params = qsBuild({ cod: a.codAcreedor, nombre: a.nombreEmpresa, logo: a.imagen });
      return `
      <div class="card">
        <div class="card-row">
          ${a.imagen ? `<img class="pieza-foto" src="${a.imagen}" alt="" style="width:56px;height:56px;border-radius:50%;" />` : ""}
          <div style="flex:1;">
            <h3>${escapeHtml(a.nombreEmpresa)}</h3>
            <p>Saldo pendiente: ${money(a.deudaTotal)}</p>
          </div>
        </div>
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="creditos-detalle.html?${params}">Ver créditos</a>
        </div>
      </div>`;
    })
    .join("");
}

/* ---------- Agregar acreedor ---------- */
const modal = document.getElementById("modal-acreedor");
let archivo = null;

document.getElementById("btn-agregar").addEventListener("click", () => {
  document.getElementById("a-nombre").value = "";
  document.getElementById("a-foto").value = "";
  document.getElementById("a-preview").style.display = "none";
  document.querySelectorAll("#modal-acreedor .error-text").forEach((el) => el.classList.remove("visible"));
  archivo = null;
  modal.hidden = false;
});
document.getElementById("btn-cancelar-acreedor").addEventListener("click", () => (modal.hidden = true));

document.getElementById("a-foto").addEventListener("change", (e) => {
  archivo = e.target.files[0] || null;
  const preview = document.getElementById("a-preview");
  if (archivo) {
    preview.src = URL.createObjectURL(archivo);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
});

document.getElementById("btn-guardar-acreedor").addEventListener("click", async () => {
  const nombre = document.getElementById("a-nombre").value.trim();
  const errores = document.querySelectorAll("#modal-acreedor .error-text");
  let valido = true;
  errores[0].classList.toggle("visible", !nombre);
  if (!nombre) valido = false;
  errores[1].classList.toggle("visible", !archivo);
  if (!archivo) valido = false;
  if (!valido) {
    toast("Complete todos los campos.", "error");
    return;
  }

  const btn = document.getElementById("btn-guardar-acreedor");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const codAcreedor = String(Date.now());
    const refFoto = storageRef(storage, `ACREEDORES_IMG/${codAcreedor}.jpg`);
    await uploadBytes(refFoto, archivo);
    const urlFoto = await getDownloadURL(refFoto);

    await set(dbRef(db, `${RUTA}/${codAcreedor}`), {
      codAcreedor,
      nombreEmpresa: nombre,
      deudaTotal: "0",
      imagen: urlFoto,
    });

    toast("Acreedor agregado con éxito.", "success");
    modal.hidden = true;
  } catch (e) {
    toast("Error al guardar: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

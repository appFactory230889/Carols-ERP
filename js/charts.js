import { escapeHtml, money } from "./utils.js";

// Paleta categórica fija por concepto (nunca se reasigna por rango/orden — la
// identidad de cada categoría siempre usa el mismo color).
export const COLOR_CATEGORIA = {
  "Venta": "#2a78d6",
  "Anticipo": "#1baf7a",
  "Otro ingreso": "#eda100",
  "Materia Prima": "#eb6834",
  "Salarios": "#4a3aa7",
  "Abono a Credito": "#e87ba4",
  "Otro gasto": "#e34948",
};
const COLOR_CATEGORIA_DEFECTO = "#898781";
export const COLOR_ENTRADA = "#008300";
export const COLOR_SALIDA = "#e34948";

function colorDeCategoria(nombre) {
  return COLOR_CATEGORIA[nombre] || COLOR_CATEGORIA_DEFECTO;
}

let tooltipEl = null;
function tooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function mostrarTooltip(evt, lineas) {
  const el = tooltip();
  el.innerHTML = "";
  lineas.forEach(({ texto, color }) => {
    const fila = document.createElement("div");
    fila.className = "chart-tooltip-fila";
    if (color) {
      const key = document.createElement("span");
      key.className = "chart-tooltip-key";
      key.style.background = color;
      fila.appendChild(key);
    }
    const val = document.createElement("span");
    val.textContent = texto;
    fila.appendChild(val);
    el.appendChild(fila);
  });
  el.style.display = "block";
  moverTooltip(evt);
}
function moverTooltip(evt) {
  const el = tooltip();
  const pad = 14;
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  const rect = el.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight) y = evt.clientY - rect.height - pad;
  el.style.left = x + "px";
  el.style.top = y + "px";
}
function ocultarTooltip() {
  if (tooltipEl) tooltipEl.style.display = "none";
}

/**
 * Barras horizontales para comparar magnitudes entre categorías.
 * datos: [{ label, value }], se ordena por valor descendente.
 */
export function renderBarChartCategorias(containerId, datos) {
  const cont = document.getElementById(containerId);
  if (!datos.length) {
    cont.innerHTML = '<div class="empty-state">Sin movimientos en este rango.</div>';
    return;
  }
  const ordenado = [...datos].sort((a, b) => b.value - a.value);
  const max = Math.max(...ordenado.map((d) => d.value), 1);

  cont.innerHTML = `<div class="chart-hbars">${ordenado
    .map((d) => {
      const color = colorDeCategoria(d.label);
      const pct = Math.max((d.value / max) * 100, 2);
      return `
      <div class="chart-hbar-row" data-label="${escapeHtml(d.label)}" data-value="${d.value}">
        <div class="chart-hbar-label">${escapeHtml(d.label)}</div>
        <div class="chart-hbar-track">
          <div class="chart-hbar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
        <div class="chart-hbar-value">${money(d.value)}</div>
      </div>`;
    })
    .join("")}</div>`;

  cont.querySelectorAll(".chart-hbar-row").forEach((row) => {
    const color = colorDeCategoria(row.dataset.label);
    row.addEventListener("pointermove", (evt) => {
      mostrarTooltip(evt, [{ texto: `${row.dataset.label}: ${money(row.dataset.value)}`, color }]);
    });
    row.addEventListener("pointerleave", ocultarTooltip);
  });
}

/**
 * Barras agrupadas (Entradas vs Salidas) por período, en orden cronológico.
 * datos: [{ periodo, entradas, salidas }]
 */
export function renderBarChartMensual(containerId, datos) {
  const cont = document.getElementById(containerId);
  if (!datos.length) {
    cont.innerHTML = '<div class="empty-state">Sin movimientos registrados todavía.</div>';
    return;
  }
  const ordenado = [...datos].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const max = Math.max(...ordenado.flatMap((d) => [d.entradas, d.salidas]), 1);
  const ALTO = 160;

  cont.innerHTML = `
    <div class="chart-legend">
      <span class="chart-legend-item"><span class="chart-legend-key" style="background:${COLOR_ENTRADA};"></span>Entradas</span>
      <span class="chart-legend-item"><span class="chart-legend-key" style="background:${COLOR_SALIDA};"></span>Salidas</span>
    </div>
    <div class="chart-vbars" style="height:${ALTO}px;">
      ${ordenado
        .map((d) => {
          const hEntradas = Math.max((d.entradas / max) * ALTO, d.entradas > 0 ? 2 : 0);
          const hSalidas = Math.max((d.salidas / max) * ALTO, d.salidas > 0 ? 2 : 0);
          return `
          <div class="chart-vbar-group" data-periodo="${escapeHtml(d.periodo)}" data-entradas="${d.entradas}" data-salidas="${d.salidas}">
            <div class="chart-vbar-pair">
              <div class="chart-vbar" style="height:${hEntradas}px; background:${COLOR_ENTRADA};"></div>
              <div class="chart-vbar" style="height:${hSalidas}px; background:${COLOR_SALIDA};"></div>
            </div>
            <div class="chart-vbar-label">${escapeHtml(d.periodo.slice(5))}</div>
          </div>`;
        })
        .join("")}
    </div>`;

  cont.querySelectorAll(".chart-vbar-group").forEach((g) => {
    g.addEventListener("pointermove", (evt) => {
      mostrarTooltip(evt, [
        { texto: `${g.dataset.periodo}` },
        { texto: `Entradas: ${money(g.dataset.entradas)}`, color: COLOR_ENTRADA },
        { texto: `Salidas: ${money(g.dataset.salidas)}`, color: COLOR_SALIDA },
      ]);
    });
    g.addEventListener("pointerleave", ocultarTooltip);
  });
}

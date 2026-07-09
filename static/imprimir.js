const params = new URLSearchParams(window.location.search);
const inputFecha = document.getElementById('fecha');
inputFecha.value = params.get('fecha') || new Date().toISOString().split('T')[0];
inputFecha.addEventListener('change', () => cargarTodo(false));

const contenido = document.getElementById('contenido');

function formatearNum(n, decimales = 4) {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function formatearFecha(fechaStr) {
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ============================================================
// REPORTE 1: Campamentos — Detalle
// ============================================================
async function construirReporteCampamentos(fecha) {
  const respFecha = await fetch(`/api/reportes/fecha/${fecha}`);
  const info = await respFecha.json();
  if (!info.existe) {
    return `
      <section class="reporte">
        <h2>Reporte de Campamentos — Detalle</h2>
        <p class="vacio">No hay reporte de campamentos guardado para esta fecha.</p>
      </section>`;
  }

  const resp = await fetch(`/api/reportes/${info.reporte_id}`);
  const r = await resp.json();

  const totales = { erradicado: 0, total_erradicado: 0, mensura: 0, total_mensura: 0, alm: 0, errad: 0, lotes: 0, parcelas: 0 };
  const filas = r.detalles.map(d => {
    for (const campo of Object.keys(totales)) totales[campo] += Number(d[campo]) || 0;
    return `
      <tr>
        <td class="col-nombre">${d.campamento}</td>
        <td>${d.federacion || ''}</td>
        <td>${d.central || ''}</td>
        <td>${d.sindicato || ''}</td>
        <td>${d.erradicado ?? ''}</td>
        <td>${d.total_erradicado ?? ''}</td>
        <td>${d.mensura ?? ''}</td>
        <td>${d.total_mensura ?? ''}</td>
        <td>${d.alm ?? ''}</td>
        <td>${d.errad ?? ''}</td>
        <td>${d.lotes ?? ''}</td>
        <td>${d.parcelas ?? ''}</td>
        <td>${d.encargado_camp || ''}</td>
        <td>${d.observaciones || ''}</td>
      </tr>`;
  }).join('');

  return `
    <section class="reporte">
      <h2>Reporte de Campamentos — Detalle — ${formatearFecha(r.fecha)}${r.responsable ? ' — ' + r.responsable : ''}</h2>
      <table>
        <thead>
          <tr>
            <th class="col-izq">Camp.</th><th>Federación</th><th>Central</th><th>Sindicato</th>
            <th>E (Has.)</th><th>Total E</th><th>M (Has.)</th><th>Total M</th>
            <th>Alm.</th><th>Errad.</th><th>Lotes</th><th>Parcelas</th>
            <th>Encargado</th><th>Observaciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">TOTAL</td>
            <td>${totales.erradicado || ''}</td>
            <td>${totales.total_erradicado || ''}</td>
            <td>${totales.mensura || ''}</td>
            <td>${totales.total_mensura || ''}</td>
            <td>${totales.alm || ''}</td>
            <td>${totales.errad || ''}</td>
            <td>${totales.lotes || ''}</td>
            <td>${totales.parcelas || ''}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

// ============================================================
// REPORTE 2: Racionalización y Erradicación
// ============================================================
async function construirErradicacion(fecha) {
  const [filasFed, data] = await Promise.all([
    fetch(`/api/resumen-por-federacion/${fecha}`).then(r => r.json()),
    fetch(`/api/resumen-areas-legales/${fecha}`).then(r => r.json()),
  ]);

  const filasFedHtml = filasFed.length === 0
    ? `<tr><td colspan="8" class="vacio">No hay datos de Campamentos guardados para esta fecha.</td></tr>`
    : filasFed.map(f => `
        <tr>
          <td class="col-nombre">${f.federacion}</td>
          <td>${formatearNum(f.erradicada)}</td>
          <td>${formatearNum(f.mensura)}</td>
          <td>${formatearNum(f.total)}</td>
          <td>${formatearNum(f.alm, 0)}</td>
          <td>${formatearNum(f.errad, 0)}</td>
          <td>${formatearNum(f.lotes, 0)}</td>
          <td>${formatearNum(f.parcelas, 0)}</td>
        </tr>`).join('');

  function bloqueAreaLegal(filas, subtotal) {
    if (filas.length === 0) return `<tr><td colspan="7" class="vacio">Sin datos.</td></tr>`;
    const cuerpo = filas.map(f => `
      <tr>
        <td class="col-nombre">${f.federacion}</td>
        <td>${formatearNum(f.erradicada_dia)}</td>
        <td>${formatearNum(f.total_erradicada_anio)}</td>
        <td>${formatearNum(f.mensura_dia)}</td>
        <td>${formatearNum(f.total_mensura_anio)}</td>
        <td>${formatearNum(f.alm_dia, 0)}</td>
        <td>${formatearNum(f.total_alm_anio, 0)}</td>
      </tr>`).join('');
    return cuerpo + `
      <tr class="subtotal">
        <td>SUBTOTAL</td>
        <td>${formatearNum(subtotal.erradicada_dia)}</td>
        <td>${formatearNum(subtotal.total_erradicada_anio)}</td>
        <td>${formatearNum(subtotal.mensura_dia)}</td>
        <td>${formatearNum(subtotal.total_mensura_anio)}</td>
        <td>${formatearNum(subtotal.alm_dia, 0)}</td>
        <td>${formatearNum(subtotal.total_alm_anio, 0)}</td>
      </tr>`;
  }

  function bloqueParque(filas, subtotal) {
    if (filas.length === 0) return `<tr><td colspan="5" class="vacio">Sin datos.</td></tr>`;
    const cuerpo = filas.map(f => `
      <tr>
        <td class="col-nombre">${f.federacion}</td>
        <td>${formatearNum(f.erradicada_dia)}</td>
        <td>${formatearNum(f.total_erradicada_anio)}</td>
        <td>${formatearNum(f.alm_dia, 0)}</td>
        <td>${formatearNum(f.total_alm_anio, 0)}</td>
      </tr>`).join('');
    return cuerpo + `
      <tr class="subtotal">
        <td>SUBTOTAL</td>
        <td>${formatearNum(subtotal.erradicada_dia)}</td>
        <td>${formatearNum(subtotal.total_erradicada_anio)}</td>
        <td>${formatearNum(subtotal.alm_dia, 0)}</td>
        <td>${formatearNum(subtotal.total_alm_anio, 0)}</td>
      </tr>`;
  }

  const tg = data.total_general;

  return `
    <section class="reporte">
      <h2>Racionalización y Erradicación — "UDESTRO" — ${formatearFecha(data.fecha)}</h2>

      <h3>Por Federación</h3>
      <table>
        <thead><tr>
          <th class="col-izq">Federación</th><th>E&lt; (Erradicada)</th><th>M&lt; (Mensura)</th><th>T (Total)</th>
          <th>Alm.</th><th>Errad.</th><th>Lotes</th><th>Parcelas</th>
        </tr></thead>
        <tbody>${filasFedHtml}</tbody>
      </table>

      <h3>Área Legal</h3>
      <table>
        <thead><tr>
          <th class="col-izq">Federación</th><th>Erradicada día</th><th>Total erradicada año</th>
          <th>Mensura día</th><th>Total mensura año</th><th>Alm. día</th><th>Total alm. año</th>
        </tr></thead>
        <tbody>${bloqueAreaLegal(data.area_legal, data.subtotales.area_legal)}</tbody>
      </table>

      <h3>Parques Nal. y Áreas Ilegales CBBA-LP-BENI</h3>
      <table>
        <thead><tr>
          <th class="col-izq">Área</th><th>Erradicada día</th><th>Total erradicada año</th><th>Alm. día</th><th>Total alm. año</th>
        </tr></thead>
        <tbody>${bloqueParque(data.parque_cbba_lp_beni, data.subtotales.parque_cbba_lp_beni)}</tbody>
      </table>

      <h3>Parques Nal. y Áreas Ilegales Santa Cruz</h3>
      <table>
        <thead><tr>
          <th class="col-izq">Área</th><th>Erradicada día</th><th>Total erradicada año</th><th>Alm. día</th><th>Total alm. año</th>
        </tr></thead>
        <tbody>${bloqueParque(data.parque_santa_cruz, data.subtotales.parque_santa_cruz)}</tbody>
      </table>

      <h3>Total General</h3>
      <table>
        <thead><tr>
          <th class="col-izq"></th><th>Err. día</th><th>Tot. err. año</th><th>Men. día</th><th>Tot. men. año</th>
          <th>Lot. día</th><th>Tot. lot. año</th><th>Pol. día</th><th>Tot. pol. año</th>
          <th>Alm. día</th><th>Tot. alm. año</th>
        </tr></thead>
        <tbody>
          <tr class="total-general">
            <td class="col-nombre">TOTAL GENERAL</td>
            <td>${formatearNum(tg.erradicada_dia)}</td>
            <td>${formatearNum(tg.total_erradicada_anio)}</td>
            <td>${formatearNum(tg.mensura_dia)}</td>
            <td>${formatearNum(tg.total_mensura_anio)}</td>
            <td>${formatearNum(tg.lotes_dia, 0)}</td>
            <td>${formatearNum(tg.total_lotes_anio, 0)}</td>
            <td>${formatearNum(tg.poligonos_dia, 0)}</td>
            <td>${formatearNum(tg.total_poligonos_anio, 0)}</td>
            <td>${formatearNum(tg.alm_dia, 0)}</td>
            <td>${formatearNum(tg.total_alm_anio, 0)}</td>
          </tr>
        </tbody>
      </table>
    </section>`;
}

// ============================================================
// REPORTE 3: Por Zona y Departamento
// ============================================================
async function construirZonas(fecha) {
  const data = await fetch(`/api/resumen-zona-departamento/${fecha}`).then(r => r.json());

  function bloqueZona(filas, total) {
    if (filas.length === 0) return `<tr><td colspan="3" class="vacio">Sin datos.</td></tr>`;
    const cuerpo = filas.map(f => `
      <tr>
        <td class="col-nombre">${f.nombre}</td>
        <td>${formatearNum(f.erradicada_dia)}</td>
        <td>${formatearNum(f.alm_dia, 0)}</td>
      </tr>`).join('');
    return cuerpo + `
      <tr class="total">
        <td>TOTAL</td>
        <td>${formatearNum(total.erradicada_dia)}</td>
        <td>${formatearNum(total.alm_dia, 0)}</td>
      </tr>`;
  }

  const filasDepto = data.departamentos.map(d => `
    <tr>
      <td class="col-nombre">${d.departamento}</td>
      <td>${d.poligonos}</td>
      <td>${formatearNum(d.erradicada_dia)}</td>
      <td>${formatearNum(d.alm_dia, 0)}</td>
    </tr>`).join('');

  return `
    <section class="reporte">
      <h2>Por Zona y Departamento — "UDESTRO" — ${formatearFecha(data.fecha)}</h2>

      <h3>Zona Autorizada - Cochabamba</h3>
      <table>
        <thead><tr><th class="col-izq">Federación</th><th>Del día (Sup.Has.)</th><th>Alm. (m2.)</th></tr></thead>
        <tbody>${bloqueZona(data.zona_autorizada_cochabamba, data.subtotales.zona_autorizada_cochabamba)}</tbody>
      </table>

      <h3>Zona No Autorizada - Cochabamba</h3>
      <table>
        <thead><tr><th class="col-izq">Área</th><th>Del día (Sup.Has.)</th><th>Alm. (m2.)</th></tr></thead>
        <tbody>${bloqueZona(data.zona_no_autorizada_cochabamba, data.subtotales.zona_no_autorizada_cochabamba)}</tbody>
      </table>

      <h3>Zona No Autorizada - Beni</h3>
      <table>
        <thead><tr><th class="col-izq">Área</th><th>Del día (Sup.Has.)</th><th>Alm. (m2.)</th></tr></thead>
        <tbody>${bloqueZona(data.zona_no_autorizada_beni, data.subtotales.zona_no_autorizada_beni)}</tbody>
      </table>

      <h3>Zona No Autorizada - Santa Cruz</h3>
      <table>
        <thead><tr><th class="col-izq">Área</th><th>Del día (Sup.Has.)</th><th>Alm. (m2.)</th></tr></thead>
        <tbody>${bloqueZona(data.zona_no_autorizada_santa_cruz, data.subtotales.zona_no_autorizada_santa_cruz)}</tbody>
      </table>

      <h3>Departamento</h3>
      <table>
        <thead><tr><th class="col-izq">Departamento</th><th>#Polígonos</th><th>Del día (Sup.Has.)</th><th>Alm. (m2.)</th></tr></thead>
        <tbody>
          ${filasDepto}
          <tr class="total-general">
            <td>TOTAL GENERAL</td>
            <td>${data.total_general.poligonos}</td>
            <td>${formatearNum(data.total_general.erradicada_dia)}</td>
            <td>${formatearNum(data.total_general.alm_dia, 0)}</td>
          </tr>
        </tbody>
      </table>
    </section>`;
}

// ============================================================
// Orquestación
// ============================================================
async function cargarTodo(autoImprimir) {
  const fecha = inputFecha.value;
  contenido.innerHTML = 'Cargando…';
  try {
    const [html1, html2, html3] = await Promise.all([
      construirReporteCampamentos(fecha),
      construirErradicacion(fecha),
      construirZonas(fecha),
    ]);
    contenido.innerHTML = html1 + html2 + html3;
    if (autoImprimir) {
      setTimeout(() => window.print(), 300);
    }
  } catch (err) {
    contenido.innerHTML = `<p class="vacio">No se pudo cargar la información: ${err.message}</p>`;
  }
}

cargarTodo(true);

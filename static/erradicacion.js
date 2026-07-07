const inputFecha = document.getElementById('fecha');
inputFecha.value = new Date().toISOString().split('T')[0];
inputFecha.addEventListener('change', cargarTodo);

// ============================================================
// Pestañas
// ============================================================
document.querySelectorAll('.pestaña').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pestaña').forEach(b => b.classList.remove('activa'));
    document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
    btn.classList.add('activa');
    document.getElementById(btn.dataset.vista).classList.add('activa');
  });
});

function formatearNum(n, decimales = 4) {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

// ============================================================
// VISTA 1: Por Federación
// ============================================================
async function cargarVistaFederacion() {
  const cuerpo = document.getElementById('cuerpoFederacion');
  try {
    const resp = await fetch(`/api/resumen-por-federacion/${inputFecha.value}`);
    if (!resp.ok) throw new Error();
    const filas = await resp.json();

    if (filas.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="8" class="vacio">No hay datos de Campamentos guardados para esta fecha.</td></tr>`;
      return;
    }

    cuerpo.innerHTML = '';
    filas.forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-nombre">${f.federacion}</td>
        <td>${formatearNum(f.erradicada)}</td>
        <td>${formatearNum(f.mensura)}</td>
        <td>${formatearNum(f.total)}</td>
        <td>${formatearNum(f.alm, 0)}</td>
        <td>${formatearNum(f.errad, 0)}</td>
        <td>${formatearNum(f.lotes, 0)}</td>
        <td>${formatearNum(f.parcelas, 0)}</td>
      `;
      cuerpo.appendChild(tr);
    });
  } catch (err) {
    cuerpo.innerHTML = `<tr><td colspan="8" class="vacio">No se pudo cargar la información.</td></tr>`;
  }
}

// ============================================================
// VISTA 2: Área Legal y Parques
// ============================================================
async function cargarVistaAreas() {
  const cAreaLegal = document.getElementById('cuerpoAreaLegal');
  const cCbba = document.getElementById('cuerpoParqueCbba');
  const cSC = document.getElementById('cuerpoParqueSantaCruz');

  try {
    const resp = await fetch(`/api/resumen-areas-legales/${inputFecha.value}`);
    if (!resp.ok) throw new Error();
    const data = await resp.json();

    renderBloqueAreaLegal(cAreaLegal, data.area_legal, data.subtotales.area_legal);
    renderBloqueParque(cCbba, data.parque_cbba_lp_beni, data.subtotales.parque_cbba_lp_beni);
    renderBloqueParque(cSC, data.parque_santa_cruz, data.subtotales.parque_santa_cruz);
    renderTotalGeneral(data.total_general);
  } catch (err) {
    [cAreaLegal, cCbba, cSC].forEach(c => {
      c.innerHTML = `<tr><td colspan="7" class="vacio">No se pudo cargar la información.</td></tr>`;
    });
    document.getElementById('cuerpoTotalGeneral').innerHTML =
      `<tr><td colspan="11" class="vacio">No se pudo cargar la información.</td></tr>`;
  }
}

function renderTotalGeneral(tg) {
  const cuerpo = document.getElementById('cuerpoTotalGeneral');
  const tr = document.createElement('tr');
  tr.className = 'total-general';
  tr.innerHTML = `
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
  `;
  cuerpo.innerHTML = '';
  cuerpo.appendChild(tr);
}

function renderBloqueAreaLegal(cuerpo, filas, subtotal) {
  if (filas.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="7" class="vacio">Sin datos.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = '';
  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-nombre">${f.federacion}</td>
      <td>${formatearNum(f.erradicada_dia)}</td>
      <td class="col-historico">${formatearNum(f.total_erradicada_anio)}</td>
      <td>${formatearNum(f.mensura_dia)}</td>
      <td class="col-historico">${formatearNum(f.total_mensura_anio)}</td>
      <td>${formatearNum(f.alm_dia, 0)}</td>
      <td class="col-historico">${formatearNum(f.total_alm_anio, 0)}</td>
    `;
    cuerpo.appendChild(tr);
  });
  const tr = document.createElement('tr');
  tr.className = 'subtotal';
  tr.innerHTML = `
    <td>SUBTOTAL</td>
    <td>${formatearNum(subtotal.erradicada_dia)}</td>
    <td>${formatearNum(subtotal.total_erradicada_anio)}</td>
    <td>${formatearNum(subtotal.mensura_dia)}</td>
    <td>${formatearNum(subtotal.total_mensura_anio)}</td>
    <td>${formatearNum(subtotal.alm_dia, 0)}</td>
    <td>${formatearNum(subtotal.total_alm_anio, 0)}</td>
  `;
  cuerpo.appendChild(tr);
}

function renderBloqueParque(cuerpo, filas, subtotal) {
  if (filas.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="5" class="vacio">Sin datos.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = '';
  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-nombre">${f.federacion}</td>
      <td>${formatearNum(f.erradicada_dia)}</td>
      <td class="col-historico">${formatearNum(f.total_erradicada_anio)}</td>
      <td>${formatearNum(f.alm_dia, 0)}</td>
      <td class="col-historico">${formatearNum(f.total_alm_anio, 0)}</td>
    `;
    cuerpo.appendChild(tr);
  });
  const tr = document.createElement('tr');
  tr.className = 'subtotal';
  tr.innerHTML = `
    <td>SUBTOTAL</td>
    <td>${formatearNum(subtotal.erradicada_dia)}</td>
    <td>${formatearNum(subtotal.total_erradicada_anio)}</td>
    <td>${formatearNum(subtotal.alm_dia, 0)}</td>
    <td>${formatearNum(subtotal.total_alm_anio, 0)}</td>
  `;
  cuerpo.appendChild(tr);
}

// ============================================================
// Inicio
// ============================================================
function cargarTodo() {
  cargarVistaFederacion();
  cargarVistaAreas();
}

cargarTodo();

const inputFecha = document.getElementById('fecha');
inputFecha.value = new Date().toISOString().split('T')[0];
inputFecha.addEventListener('change', cargar);

function formatearNum(n, decimales = 4) {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function renderBloque(cuerpo, filas, total) {
  if (filas.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="3" class="vacio">Sin datos.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = '';
  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-nombre">${f.nombre}</td>
      <td>${formatearNum(f.erradicada_dia)}</td>
      <td>${formatearNum(f.alm_dia, 0)}</td>
    `;
    cuerpo.appendChild(tr);
  });
  const tr = document.createElement('tr');
  tr.className = 'total';
  tr.innerHTML = `
    <td>TOTAL</td>
    <td>${formatearNum(total.erradicada_dia)}</td>
    <td>${formatearNum(total.alm_dia, 0)}</td>
  `;
  cuerpo.appendChild(tr);
}

async function cargar() {
  const cuerpos = {
    autCbba: document.getElementById('cuerpoAutCbba'),
    noAutCbba: document.getElementById('cuerpoNoAutCbba'),
    noAutBeni: document.getElementById('cuerpoNoAutBeni'),
    noAutSC: document.getElementById('cuerpoNoAutSC'),
    departamento: document.getElementById('cuerpoDepartamento'),
  };

  try {
    const resp = await fetch(`/api/resumen-zona-departamento/${inputFecha.value}`);
    if (!resp.ok) throw new Error();
    const data = await resp.json();

    renderBloque(cuerpos.autCbba, data.zona_autorizada_cochabamba, data.subtotales.zona_autorizada_cochabamba);
    renderBloque(cuerpos.noAutCbba, data.zona_no_autorizada_cochabamba, data.subtotales.zona_no_autorizada_cochabamba);
    renderBloque(cuerpos.noAutBeni, data.zona_no_autorizada_beni, data.subtotales.zona_no_autorizada_beni);
    renderBloque(cuerpos.noAutSC, data.zona_no_autorizada_santa_cruz, data.subtotales.zona_no_autorizada_santa_cruz);

    cuerpos.departamento.innerHTML = '';
    data.departamentos.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-nombre">${d.departamento}</td>
        <td>${d.poligonos}</td>
        <td>${formatearNum(d.erradicada_dia)}</td>
        <td>${formatearNum(d.alm_dia, 0)}</td>
      `;
      cuerpos.departamento.appendChild(tr);
    });
    const trTotal = document.createElement('tr');
    trTotal.className = 'total-general';
    trTotal.innerHTML = `
      <td>TOTAL GENERAL</td>
      <td>${data.total_general.poligonos}</td>
      <td>${formatearNum(data.total_general.erradicada_dia)}</td>
      <td>${formatearNum(data.total_general.alm_dia, 0)}</td>
    `;
    cuerpos.departamento.appendChild(trTotal);

  } catch (err) {
    Object.values(cuerpos).forEach(c => {
      c.innerHTML = `<tr><td colspan="4" class="vacio">No se pudo cargar la información.</td></tr>`;
    });
  }
}

cargar();

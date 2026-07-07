let campamentos = [];
let campamentoSeleccionado = null;

const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const btnConsultar = document.getElementById('btnConsultar');
const campamentosGrid = document.getElementById('campamentosGrid');
const cuerpoTabla = document.getElementById('cuerpoTabla');
const pieTabla = document.getElementById('pieTabla');
const estado = document.getElementById('estado');

function hoyISO() {
  return new Date().toISOString().split('T')[0];
}

function formatearFecha(fechaStr) {
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatearNum(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString('es-BO', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

async function cargarCampamentos() {
  try {
    const resp = await fetch('/api/campamentos');
    if (!resp.ok) throw new Error('No se pudo cargar campamentos');
    campamentos = await resp.json();

    campamentosGrid.innerHTML = `
      <button class="campamento-btn activo" data-id="" title="Todos los campamentos">
        TODOS
      </button>
    ` + campamentos.map(c => `
      <button class="campamento-btn" data-id="${c.id}" title="${c.nombre}">
        ${c.nombre}
      </button>
    `).join('');
  } catch (err) {
    estado.textContent = 'No se pudo cargar la lista de campamentos.';
  }
}

function seleccionarCampamento(campamentoId) {
  campamentoSeleccionado = campamentoId ? Number(campamentoId) : null;
  document.querySelectorAll('.campamento-btn').forEach(btn => {
    const valor = btn.dataset.id ? Number(btn.dataset.id) : null;
    btn.classList.toggle('activo', valor === campamentoSeleccionado);
  });
}

campamentosGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.campamento-btn');
  if (!btn) return;
  seleccionarCampamento(btn.dataset.id);
  consultar();
});

btnConsultar.addEventListener('click', consultar);

async function consultar() {
  if (!fechaInicio.value || !fechaFin.value) {
    estado.textContent = 'Seleccione fecha inicio y fecha fin.';
    return;
  }

  if (fechaFin.value < fechaInicio.value) {
    estado.textContent = 'La fecha final no puede ser menor que la fecha inicial.';
    return;
  }

  estado.textContent = 'Consultando...';
  cuerpoTabla.innerHTML = '<tr><td colspan="4" class="vacio">Cargando...</td></tr>';
  pieTabla.innerHTML = '';

  const params = new URLSearchParams({
    fecha_inicio: fechaInicio.value,
    fecha_fin: fechaFin.value,
  });
  if (campamentoSeleccionado) {
    params.set('campamento_id', campamentoSeleccionado);
  }

  try {
    const resp = await fetch(`/api/resumen-campamento-rango?${params.toString()}`);
    if (!resp.ok) throw new Error('Consulta fallida');
    const data = await resp.json();
    renderTabla(data);
  } catch (err) {
    estado.textContent = 'No se pudo consultar el rango.';
    cuerpoTabla.innerHTML = '<tr><td colspan="4" class="vacio">Error al cargar la informacion.</td></tr>';
  }
}

function renderTabla(data) {
  if (!data.filas.length) {
    estado.textContent = 'Sin datos para ese rango y campamento.';
    cuerpoTabla.innerHTML = '<tr><td colspan="4" class="vacio">Sin datos.</td></tr>';
    pieTabla.innerHTML = '';
    return;
  }

  estado.textContent = `${data.filas.length} fecha(s) encontradas.`;
  cuerpoTabla.innerHTML = data.filas.map(f => `
    <tr>
      <td class="col-nombre">${f.campamento}</td>
      <td>${formatearFecha(f.fecha)}</td>
      <td class="col-numero">${formatearNum(f.erradicada)}</td>
      <td class="col-numero">${formatearNum(f.mensura)}</td>
    </tr>
  `).join('');

  pieTabla.innerHTML = `
    <tr>
      <td colspan="2">TOTAL</td>
      <td class="col-numero">${formatearNum(data.total.erradicada)}</td>
      <td class="col-numero">${formatearNum(data.total.mensura)}</td>
    </tr>
  `;
}

fechaInicio.value = hoyISO();
fechaFin.value = hoyISO();
cargarCampamentos();

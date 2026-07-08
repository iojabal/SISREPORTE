// ============================================================
// Estado en memoria
// ============================================================
let campamentos = [];
let federaciones = []; // catálogo completo: área legal + parques/zonas ilegales

const tbody = document.getElementById('cuerpoTabla');
const inputFecha = document.getElementById('fecha');
const inputResponsable = document.getElementById('responsable');
const estadoGuardado = document.getElementById('estadoGuardado');
const listaHistorial = document.getElementById('listaHistorial');

// Fecha de hoy por defecto
inputFecha.value = new Date().toISOString().split('T')[0];

// ============================================================
// Carga inicial
// ============================================================
async function cargarCampamentos() {
  try {
    const [respCamp, respFed] = await Promise.all([
      fetch('/api/campamentos'),
      fetch('/api/federaciones-todas'),
    ]);
    if (!respCamp.ok) throw new Error('No se pudo cargar la lista de campamentos');
    campamentos = await respCamp.json();
    // /api/federaciones-todas devuelve una lista de nombres (strings),
    // no objetos {nombre: ...} como clasificacion-federaciones.
    federaciones = respFed.ok ? await respFed.json() : [];
    // La tabla arranca vacía: el usuario agrega cada fila a mano con
    // "+ Agregar fila". Solo se necesita la lista de campamentos para
    // resolver el id al guardar el reporte.
    actualizarTotales();
  } catch (err) {
    mostrarEstado('error', 'No se pudo conectar con el servidor. Verifique la red.');
  }
}

// ============================================================
// Fila de totales (se recalcula con cada cambio en la tabla)
// ============================================================
const CAMPOS_TOTAL = [
  'f-erradicado', 'f-total-erradicado', 'f-mensura', 'f-total-mensura',
  'f-alm', 'f-errad', 'f-lotes', 'f-parcelas',
];

function actualizarTotales() {
  const totales = {};
  CAMPOS_TOTAL.forEach(campo => { totales[campo] = 0; });

  tbody.querySelectorAll('tr').forEach(tr => {
    CAMPOS_TOTAL.forEach(campo => {
      const input = tr.querySelector('.' + campo);
      totales[campo] += input ? (parseFloat(input.value) || 0) : 0;
    });
  });

  const pie = document.getElementById('pieTabla');
  pie.innerHTML = `
    <tr>
      <td colspan="4">TOTAL</td>
      <td>${totales['f-erradicado'] || ''}</td>
      <td>${totales['f-total-erradicado'] || ''}</td>
      <td>${totales['f-mensura'] || ''}</td>
      <td>${totales['f-total-mensura'] || ''}</td>
      <td>${totales['f-alm'] || ''}</td>
      <td>${totales['f-errad'] || ''}</td>
      <td>${totales['f-lotes'] || ''}</td>
      <td>${totales['f-parcelas'] || ''}</td>
      <td colspan="2"></td>
    </tr>
  `;
}

// Recalcular en vivo mientras el usuario escribe, y al quitar una fila
tbody.addEventListener('input', actualizarTotales);
tbody.addEventListener('click', (e) => {
  if (e.target.closest('.btn-fila')) {
    setTimeout(() => {
      actualizarTotales();
    }, 0);
  }
});

function crearFilaCampamento(campamentoId) {
  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td class="col-campamento" data-label="Camp."><select class="f-campamento">${opcionesCampamento(campamentoId)}</select></td>
    <td class="col-federacion" data-label="Federación"><select class="f-federacion">${opcionesFederacion()}</select></td>
    <td class="col-central" data-label="Central"><input type="text" class="f-central"></td>
    <td class="col-sindicato" data-label="Sindicato"><input type="text" class="f-sindicato"></td>
    <td class="col-numero" data-label="E"><input type="number" step="0.0001" class="f-erradicado"></td>
    <td class="col-numero" data-label="Total E"><input type="number" step="0.0001" class="f-total-erradicado"></td>
    <td class="col-numero" data-label="M"><input type="number" step="0.0001" class="f-mensura"></td>
    <td class="col-numero" data-label="Total M"><input type="number" step="0.0001" class="f-total-mensura"></td>
    <td class="col-numero" data-label="Alm."><input type="number" step="1" class="f-alm"></td>
    <td class="col-numero" data-label="Errad."><input type="number" step="1" class="f-errad"></td>
    <td class="col-numero" data-label="Lotes"><input type="number" step="1" class="f-lotes"></td>
    <td class="col-numero" data-label="Parcelas"><input type="number" step="1" class="f-parcelas"></td>
    <td class="col-encargado" data-label="Encargado"><input type="text" class="f-encargado"></td>
    <td class="col-obs" data-label="Observaciones"><input type="text" class="f-observaciones"></td>
    <td class="solo-pantalla"><button class="btn-fila" onclick="this.closest('tr').remove()" title="Quitar esta fila">✕</button></td>
  `;

  // Autocompletar el espejo (Total E / Total M) con el mismo valor al
  // tipear en E / M — pero sigue siendo editable independientemente
  // si el usuario quiere corregirlo aparte.
  const inputE = tr.querySelector('.f-erradicado');
  const inputTotalE = tr.querySelector('.f-total-erradicado');
  inputE.addEventListener('input', () => { inputTotalE.value = inputE.value; });

  const inputM = tr.querySelector('.f-mensura');
  const inputTotalM = tr.querySelector('.f-total-mensura');
  inputM.addEventListener('input', () => { inputTotalM.value = inputM.value; });

  return tr;
}

// Lista fija de campamentos (catálogo cargado desde el servidor al inicio,
// no cambia): el usuario elige cuál es con este select, no escribe texto.
function opcionesCampamento(campamentoIdSeleccionado) {
  const opciones = campamentos
    .map(c => `<option value="${c.id}"${String(c.id) === String(campamentoIdSeleccionado) ? ' selected' : ''}>${c.nombre}</option>`)
    .join('');
  return `<option value="">— Seleccionar —</option>${opciones}`;
}

function opcionesFederacion() {
  const opciones = federaciones.map(nombre => `<option value="${nombre}">${nombre}</option>`).join('');
  return `<option value="">— Seleccionar —</option>${opciones}`;
}

function agregarFilaCampamento() {
  const tr = crearFilaCampamento(null);
  tbody.appendChild(tr);
  tr.querySelector('.f-campamento').focus();
  actualizarTotales();
}

// ============================================================
// Guardar
// ============================================================
async function guardarReporte() {
  const fecha = inputFecha.value;
  if (!fecha) {
    mostrarEstado('error', 'Seleccione una fecha antes de guardar.');
    return;
  }

  const detalles = [];
  let error = false;
  tbody.querySelectorAll('tr').forEach(tr => {
    const getTexto = (cls) => tr.querySelector('.' + cls).value || null;
    const getNumero = (cls) => {
      const v = tr.querySelector('.' + cls).value;
      return v ? parseFloat(v) : null;
    };

    const valorCampamento = tr.querySelector('.f-campamento').value;
    if (!valorCampamento) { error = true; return; }
    const campamentoId = parseInt(valorCampamento, 10);

    detalles.push({
      campamento_id: campamentoId,
      federacion: getTexto('f-federacion'),
      central: getTexto('f-central'),
      sindicato: getTexto('f-sindicato'),
      erradicado: getNumero('f-erradicado'),
      total_erradicado: getNumero('f-total-erradicado'),
      mensura: getNumero('f-mensura'),
      total_mensura: getNumero('f-total-mensura'),
      alm: getNumero('f-alm'),
      errad: getNumero('f-errad'),
      lotes: getNumero('f-lotes'),
      parcelas: getNumero('f-parcelas'),
      encargado_camp: getTexto('f-encargado'),
      observaciones: getTexto('f-observaciones'),
    });
  });

  if (error) {
    mostrarEstado('error', 'Hay una fila sin campamento seleccionado. Complétela o quítela antes de guardar.');
    return;
  }

  const payload = {
    fecha: fecha,
    responsable: inputResponsable.value || null,
    usuario: null,
    detalles: detalles,
  };

  try {
    const resp = await fetch('/api/reportes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || err.error || 'Error al guardar');
    }
    mostrarEstado('ok', 'Reporte guardado correctamente.');
    cargarHistorial();
    cargarTotalesResumen();
  } catch (err) {
    mostrarEstado('error', 'No se guardó: ' + err.message);
  }
}

function mostrarEstado(tipo, texto) {
  estadoGuardado.className = 'estado-guardado ' + tipo;
  estadoGuardado.textContent = texto;
  setTimeout(() => { estadoGuardado.className = 'estado-guardado'; }, 5000);
}

// ============================================================
// Totales resumen (hoy / mes / año)
// ============================================================
const totalDia = document.getElementById('totalDia');
const totalMes = document.getElementById('totalMes');
const totalAnio = document.getElementById('totalAnio');

function formatearHas(t) {
  return `E: ${t.erradicado} has. · M: ${t.mensura} has.`;
}

async function cargarTotalesResumen() {
  const fecha = inputFecha.value;
  if (!fecha) return;
  try {
    const resp = await fetch(`/api/totales-resumen/${fecha}`);
    if (!resp.ok) throw new Error();
    const t = await resp.json();

    totalDia.innerHTML = t.dia.existe
      ? formatearHas(t.dia)
      : '<span class="sin-registrar">Sin registrar</span>';
    totalMes.textContent = formatearHas(t.mes);
    totalAnio.textContent = formatearHas(t.anio);
  } catch (err) {
    totalDia.textContent = '—';
    totalMes.textContent = '—';
    totalAnio.textContent = '—';
  }
}

inputFecha.addEventListener('change', cargarTotalesResumen);

// ============================================================
// Historial
// ============================================================
const btnCargarMas = document.getElementById('btnCargarMas');
const historialFechaInicio = document.getElementById('historialFechaInicio');
const historialFechaFin = document.getElementById('historialFechaFin');
let historialLimite = 20;

async function cargarHistorial() {
  try {
    const params = new URLSearchParams({ limite: historialLimite });
    if (historialFechaInicio && historialFechaInicio.value) {
      params.set('fecha_inicio', historialFechaInicio.value);
    }
    if (historialFechaFin && historialFechaFin.value) {
      params.set('fecha_fin', historialFechaFin.value);
    }

    const resp = await fetch(`/api/reportes?${params.toString()}`);
    if (!resp.ok) throw new Error();
    const reportes = await resp.json();

    if (reportes.length === 0) {
      listaHistorial.innerHTML = '<p style="color:#888; font-size:0.85rem;">Todavía no hay reportes guardados.</p>';
      btnCargarMas.style.display = 'none';
      return;
    }

    listaHistorial.innerHTML = '';
    reportes.forEach(r => {
      const a = document.createElement('a');
      a.className = 'item-historial';
      a.href = `/reporte/${r.id}`;
      a.innerHTML = `<span>${formatearFecha(r.fecha)} — ${r.responsable || 'Sin responsable'}</span><span>Ver →</span>`;
      listaHistorial.appendChild(a);
    });

    // Si vino la lista completa (menos que el límite), ya no hay más para cargar
    btnCargarMas.style.display = reportes.length < historialLimite ? 'none' : '';
  } catch (err) {
    listaHistorial.innerHTML = '<p style="color:#a83232; font-size:0.85rem;">No se pudo cargar el historial.</p>';
    btnCargarMas.style.display = 'none';
  }
}

function cargarMasHistorial() {
  historialLimite += 20;
  cargarHistorial();
}

function filtrarHistorial() {
  if (historialFechaInicio.value && historialFechaFin.value && historialFechaFin.value < historialFechaInicio.value) {
    listaHistorial.innerHTML = '<p style="color:#a83232; font-size:0.85rem;">La fecha final no puede ser menor que la fecha inicial.</p>';
    btnCargarMas.style.display = 'none';
    return;
  }

  historialLimite = 20;
  cargarHistorial();
}

function limpiarFiltroHistorial() {
  historialFechaInicio.value = '';
  historialFechaFin.value = '';
  historialLimite = 20;
  cargarHistorial();
}

function formatearFecha(fechaStr) {
  const f = new Date(fechaStr);
  return f.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============================================================
// Inicio
// ============================================================
cargarCampamentos();
cargarHistorial();
cargarTotalesResumen();

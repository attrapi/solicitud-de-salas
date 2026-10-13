/**
 * ============================================================
 *  AGENDA DE SALAS · ATTRAPI — backend en Google Apps Script
 * ============================================================
 *  Este archivo se pega completo en el editor de Apps Script del
 *  proyecto ligado a la hoja de cálculo (ver INSTRUCCIONES.md).
 *
 *  Qué hace:
 *   · doGet   → entrega en JSON las salas, reservaciones, catálogos y bloqueos.
 *   · doPost  → recibe las solicitudes del público y los cambios del panel.
 *
 *  No borra nada de lo que ya tengas: si a una hoja le faltan columnas,
 *  se las agrega al final y deja igual las que ya existían.
 * ============================================================
 */

var VERSION = 2;
var ZONA = 'America/Mexico_City';

// Clave del panel de administración. Lo mejor es guardarla en
// Configuración del proyecto ▸ Propiedades de la secuencia de comandos,
// con el nombre CLAVE_ADMIN. Si no, se usa la de aquí abajo.
var CLAVE_POR_DEFECTO = 'salas2026';

// Con qué estatus entra una solicitud nueva del formulario público:
//   'aceptada'  → la sala queda apartada de inmediato, sin que nadie la autorice.
//   'pendiente' → el administrador tiene que aceptarla antes de que cuente.
var ESTATUS_NUEVA_SOLICITUD = 'aceptada';

// Estatus que apartan la sala (una solicitud pendiente también aparta).
var OCUPAN = ['pendiente', 'aceptada', 'en_curso', 'concluida'];
var ESTATUS_VALIDOS = ['pendiente', 'aceptada', 'rechazada', 'en_curso', 'concluida', 'cancelada'];

var ESQUEMAS = {
  reservaciones: {
    nombre: 'Reservaciones',
    alias: ['reservaciones', 'reservacion', 'reservations', 'solicitudes', 'solicitud'],
    cols: ['id', 'sala_id', 'fecha', 'inicio', 'fin', 'nombre', 'tema', 'estatus', 'creado',
           'participantes', 'num_participantes', 'area', 'proyecto', 'notas', 'link_doc', 'link_admin',
           'mostrar_proyeccion', 'mostrar_participantes', 'actualizado'],
    texto: ['id', 'fecha', 'inicio', 'fin']
  },
  salas:      { nombre:'Salas',      alias:['salas', 'sala', 'rooms'],        cols:['id', 'nombre', 'capacidad'], texto:['id'] },
  areas:      { nombre:'Areas',      alias:['areas', 'area'],                 cols:['id', 'nombre'], texto:['id'] },
  proyectos:  { nombre:'Proyectos',  alias:['proyectos', 'proyecto'],         cols:['id', 'nombre'], texto:['id'] },
  bloqueos:   { nombre:'Bloqueos',   alias:['bloqueos', 'bloqueo'],           cols:['id', 'sala_id', 'tipo', 'mes', 'dias', 'fechas', 'inicio', 'fin', 'motivo', 'descripcion', 'mostrar_tablero'], texto:['id', 'mes', 'dias', 'fechas', 'inicio', 'fin'] }
};

// Lo que se escribe la primera vez, sólo si la hoja se acaba de crear.
var SEMILLAS = {
  salas: [
    ['periferico', 'Sala Periférico', 28],
    ['flores1', 'Sala Flores 1', 23],
    ['flores2', 'Sala Flores 2', 11]
  ],
  areas: ['SGOI-A', 'SGOI-B', 'SGOI-C', 'SPAC', 'DPAC', 'SA', 'Unidad de Construcción'].map(function (n, i) { return ['a' + (i + 1), n]; }),
  proyectos: ['Querétaro - Irapuato', 'Saltillo - Nuevo Laredo', 'Aifa - Pachuca', 'México - Querétaro',
    'Saltillo - Monterrey', 'Monterrey - Nuevo Laredo', 'Querétaro - San Luis Potosí',
    'San Luis Potosí - Saltillo', 'Irapuato - Guadalajara', 'TIMT - Tren Interurbano México Toluca',
    'Trolebús Chalco - Ixtapaluca', 'L12', 'Observatorio', 'DC C Metrop'
  ].map(function (n, i) { return ['p' + (i + 1), n]; })
};

/* ============================================================
   Utilidades
   ============================================================ */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// "Áreas" → "areas", "Sala_ID" → "sala_id"
function norm_(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function texto_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd');
  return String(v).trim();
}
// Normaliza lo que haya en una celda de fecha u hora, venga como texto o como fecha real.
function fecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd');
  var t = String(v == null ? '' : v).trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return t;
}
function hora_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'HH:mm');
  var t = String(v == null ? '' : v).trim();
  var m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : t;
}
function bool_(v, pordefecto) {
  if (v === '' || v === null || v === undefined) return pordefecto !== false;
  if (typeof v === 'boolean') return v;
  var t = String(v).trim().toLowerCase();
  return !(t === 'false' || t === '0' || t === 'no');
}
function aMin_(t) {
  var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function hoy_() { return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'); }
function ahora_() { return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm'); }
function nuevoId_() { return String(Date.now()) + String(Math.floor(Math.random() * 90) + 10); }
function slug_(s) { return norm_(s).slice(0, 28) || ('x' + Date.now()); }

function clave_() {
  var p = PropertiesService.getScriptProperties().getProperty('CLAVE_ADMIN');
  if (p && String(p).length) return String(p);
  // Si la clave estaba en una hoja de configuración, se respeta.
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = libro.getSheets();
  for (var i = 0; i < hojas.length; i++) {
    var n = norm_(hojas[i].getName());
    if (n !== 'config' && n !== 'configuracion' && n !== 'ajustes') continue;
    var datos = hojas[i].getDataRange().getValues();
    for (var f = 0; f < datos.length; f++) {
      if (/clave|password|contrasena/i.test(norm_(datos[f][0])) && String(datos[f][1] || '').length) return String(datos[f][1]);
    }
  }
  return CLAVE_POR_DEFECTO;
}
function exigirClave_(d) {
  if (String(d.clave || '') !== clave_()) throw new Error('La clave no es correcta.');
}

/* ============================================================
   Hojas: las encuentra, las crea y les completa las columnas
   ============================================================ */
// Cada ejecución revisa las columnas de una hoja una sola vez.
var _hojas = {};
function hoja_(llave) {
  if (_hojas[llave]) return _hojas[llave];
  var esq = ESQUEMAS[llave];
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = libro.getSheets(), sh = null;
  for (var i = 0; i < hojas.length && !sh; i++) {
    if (esq.alias.indexOf(norm_(hojas[i].getName())) !== -1) sh = hojas[i];
  }
  var recienCreada = false;
  if (!sh) { sh = libro.insertSheet(esq.nombre); recienCreada = true; }
  asegurarColumnas_(sh, esq);
  if (recienCreada && SEMILLAS[llave]) {
    sh.getRange(2, 1, SEMILLAS[llave].length, SEMILLAS[llave][0].length).setValues(SEMILLAS[llave]);
  }
  _hojas[llave] = sh;
  return sh;
}
function asegurarColumnas_(sh, esq) {
  var ancho = Math.max(sh.getLastColumn(), 1);
  var encabezados = sh.getRange(1, 1, 1, ancho).getValues()[0].map(norm_);
  var faltan = [];
  esq.cols.forEach(function (c) { if (encabezados.indexOf(c) === -1) faltan.push(c); });
  var vacia = encabezados.join('') === '';
  if (vacia) {
    sh.getRange(1, 1, 1, esq.cols.length).setValues([esq.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    encabezados = esq.cols.slice();
    faltan = [];
  } else if (faltan.length) {
    sh.getRange(1, ancho + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    encabezados = encabezados.concat(faltan);
  }
  // Las fechas y horas se guardan como texto, para que la hoja no las convierta sola.
  (esq.texto || []).forEach(function (c) {
    var i = encabezados.indexOf(c);
    if (i !== -1) sh.getRange(1, i + 1, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
  });
  return encabezados;
}
function encabezados_(sh) {
  var ancho = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, ancho).getValues()[0].map(norm_);
}
// Devuelve [{fila:2, datos:{...}}, …]
function filas_(llave) {
  var sh = hoja_(llave), cols = encabezados_(sh);
  if (sh.getLastRow() < 2) return { sh: sh, cols: cols, lista: [] };
  var valores = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
  var lista = [];
  valores.forEach(function (fila, i) {
    var o = {};
    cols.forEach(function (c, j) { if (c) o[c] = fila[j]; });
    if (String(o.id || '').length || String(o.nombre || '').length) lista.push({ fila: i + 2, datos: o });
  });
  return { sh: sh, cols: cols, lista: lista };
}
function escribir_(llave, obj) {
  var h = filas_(llave);
  var fila = h.cols.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  h.sh.appendRow(fila);
  return obj;
}
function actualizar_(llave, id, cambios) {
  var h = filas_(llave);
  for (var i = 0; i < h.lista.length; i++) {
    if (String(h.lista[i].datos.id) !== String(id)) continue;
    Object.keys(cambios).forEach(function (c) {
      var col = h.cols.indexOf(c);
      if (col !== -1) h.sh.getRange(h.lista[i].fila, col + 1).setValue(cambios[c]);
    });
    return true;
  }
  return false;
}
function borrar_(llave, id) {
  var h = filas_(llave);
  for (var i = 0; i < h.lista.length; i++) {
    if (String(h.lista[i].datos.id) === String(id)) { h.sh.deleteRow(h.lista[i].fila); return true; }
  }
  return false;
}

/* ============================================================
   Lectura de datos
   ============================================================ */
function leerSalas_() {
  return filas_('salas').lista.map(function (r) {
    return { id: texto_(r.datos.id) || slug_(r.datos.nombre), nombre: texto_(r.datos.nombre), capacidad: texto_(r.datos.capacidad) };
  }).filter(function (s) { return s.nombre; });
}
function leerReservaciones_() {
  return filas_('reservaciones').lista.map(function (r) {
    var d = r.datos;
    return {
      id: texto_(d.id), sala_id: texto_(d.sala_id), fecha: fecha_(d.fecha), inicio: hora_(d.inicio), fin: hora_(d.fin),
      nombre: texto_(d.nombre), tema: texto_(d.tema), estatus: norm_(d.estatus) || 'pendiente', creado: texto_(d.creado),
      participantes: texto_(d.participantes), num_participantes: texto_(d.num_participantes),
      area: texto_(d.area), proyecto: texto_(d.proyecto), notas: texto_(d.notas),
      link_doc: texto_(d.link_doc), link_admin: texto_(d.link_admin),
      mostrar_proyeccion: bool_(d.mostrar_proyeccion, true), mostrar_participantes: bool_(d.mostrar_participantes, true)
    };
  }).filter(function (r) { return r.id && r.fecha; });
}
function leerLista_(llave) {
  return filas_(llave).lista.map(function (r) {
    return { id: texto_(r.datos.id) || slug_(r.datos.nombre), nombre: texto_(r.datos.nombre) };
  }).filter(function (x) { return x.nombre; });
}
function leerBloqueos_() {
  return filas_('bloqueos').lista.map(function (r) {
    var d = r.datos;
    return {
      id: texto_(d.id), sala_id: texto_(d.sala_id), tipo: texto_(d.tipo) || 'dia', mes: texto_(d.mes),
      dias: texto_(d.dias), inicio: hora_(d.inicio), fin: hora_(d.fin),
      fechas: texto_(d.fechas).split(',').map(function (f) { return fecha_(f); }).filter(String),
      motivo: texto_(d.motivo), descripcion: texto_(d.descripcion), mostrar_tablero: bool_(d.mostrar_tablero, true)
    };
  }).filter(function (b) { return b.id && b.sala_id; });
}

function doGet(e) {
  try {
    var accion = (e && e.parameter && e.parameter.accion) || '';
    if (accion === 'diagnostico') {
      exigirClave_(e.parameter);
      var libro = SpreadsheetApp.getActiveSpreadsheet();
      return json_({
        ok: true, version: VERSION, archivo: libro.getName(),
        hojas: libro.getSheets().map(function (s) { return { nombre: s.getName(), filas: s.getLastRow(), columnas: encabezados_(s) }; })
      });
    }
    return json_({
      ok: true, version: VERSION,
      salas: leerSalas_(), reservaciones: leerReservaciones_(),
      areas: leerLista_('areas'), proyectos: leerLista_('proyectos'), bloqueos: leerBloqueos_()
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ============================================================
   Validaciones de disponibilidad
   ============================================================ */
function bloqueoDeDia_(bloqueos, salaId, fecha) {
  for (var i = 0; i < bloqueos.length; i++) {
    var b = bloqueos[i];
    if (b.sala_id === salaId && b.fechas.indexOf(fecha) !== -1 && !b.inicio && !b.fin) return b;
  }
  return null;
}
// Devuelve el texto del primer encimamiento, o '' si el horario está libre.
function revisarTraslape_(salaId, fecha, inicio, fin, excluirId) {
  var i = aMin_(inicio), f = aMin_(fin);
  var bloqueos = leerBloqueos_();
  var bl = bloqueoDeDia_(bloqueos, salaId, fecha);
  if (bl) return 'Esa sala no está disponible en esa fecha' + (bl.motivo ? ' (' + bl.motivo + ')' : '') + '.';
  var choque = '';
  bloqueos.forEach(function (b) {
    if (choque || b.sala_id !== salaId || b.fechas.indexOf(fecha) === -1 || !b.inicio || !b.fin) return;
    if (i < aMin_(b.fin) && f > aMin_(b.inicio)) choque = 'Esa sala está bloqueada de ' + b.inicio + ' a ' + b.fin + (b.motivo ? ' (' + b.motivo + ')' : '') + '.';
  });
  if (choque) return choque;
  leerReservaciones_().forEach(function (r) {
    if (choque || r.sala_id !== salaId || r.fecha !== fecha || String(r.id) === String(excluirId || '')) return;
    if (OCUPAN.indexOf(r.estatus) === -1) return;
    var oi = aMin_(r.inicio), of = aMin_(r.fin);
    if (oi === null) return;
    if (of === null) of = oi + 30;
    if (i < of && f > oi) choque = 'Ese horario ya está apartado en esa sala (' + r.inicio + '–' + r.fin + ').';
  });
  return choque;
}
// Si un valor nuevo no está en el catálogo, se agrega para que aparezca la próxima vez.
function aprender_(llave, nombre) {
  var n = String(nombre || '').trim();
  if (!n) return;
  var existe = leerLista_(llave).some(function (x) { return norm_(x.nombre) === norm_(n); });
  if (!existe) escribir_(llave, { id: slug_(n) + String(Date.now()).slice(-4), nombre: n });
}

/* ============================================================
   doPost · acciones
   ============================================================ */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (x) { return json_({ ok: false, error: 'El sistema está ocupado, intenta de nuevo en un momento.' }); }
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No llegó información.');
    var d = JSON.parse(e.postData.contents);
    switch (d.accion) {
      case 'verificar':   return accionVerificar_(d);
      case 'solicitar':   return accionSolicitar_(d);
      case 'estatus':     return accionEstatus_(d);
      case 'crear':       return accionCrear_(d);
      case 'editar':      return accionEditar_(d);
      case 'eliminar':    return accionEliminar_(d);
      case 'catalogo':    return accionCatalogo_(d);
      case 'bloqueo_guardar':  return accionBloqueoGuardar_(d);
      case 'bloqueo_eliminar': return accionBloqueoEliminar_(d);
      default: throw new Error('Acción no reconocida: ' + d.accion);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function accionVerificar_(d) {
  exigirClave_(d);
  return json_({ ok: true, version: VERSION });
}

function accionSolicitar_(d) {
  var sala = String(d.sala_id || '').trim();
  var fecha = fecha_(d.fecha), inicio = hora_(d.inicio), fin = hora_(d.fin);
  var nombre = String(d.nombre || '').trim(), tema = String(d.tema || d.asunto || '').trim();
  if (!sala || !fecha || !inicio || !fin || !nombre || !tema) throw new Error('Faltan datos de la solicitud.');
  if (!leerSalas_().some(function (s) { return s.id === sala; })) throw new Error('Esa sala no existe.');
  if (fecha < hoy_()) throw new Error('Esa fecha ya pasó.');
  if (aMin_(inicio) === null || aMin_(fin) === null || aMin_(inicio) >= aMin_(fin)) throw new Error('El horario de término debe ser después del de inicio.');
  // Hoy sólo se puede pedir del bloque en curso en adelante.
  if (fecha === hoy_()) {
    var ahora = Number(Utilities.formatDate(new Date(), ZONA, 'H')) * 60 + Number(Utilities.formatDate(new Date(), ZONA, 'm'));
    if (aMin_(inicio) < Math.floor(ahora / 30) * 30) throw new Error('Ese horario ya pasó. Elige uno de los siguientes.');
  }

  // Protección contra envíos repetidos: si ya hay una igual, se devuelve esa misma.
  var iguales = leerReservaciones_().filter(function (r) {
    return r.sala_id === sala && r.fecha === fecha && r.inicio === inicio && r.fin === fin &&
           norm_(r.nombre) === norm_(nombre) && r.estatus === ESTATUS_NUEVA_SOLICITUD;
  });
  if (iguales.length) return json_({ ok: true, id: iguales[0].id, repetida: true });

  var choque = revisarTraslape_(sala, fecha, inicio, fin, '');
  if (choque) throw new Error(choque);

  var id = nuevoId_();
  escribir_('reservaciones', {
    id: id, sala_id: sala, fecha: fecha, inicio: inicio, fin: fin, nombre: nombre, tema: tema,
    estatus: ESTATUS_NUEVA_SOLICITUD, creado: ahora_(),
    participantes: String(d.participantes || '').trim(), num_participantes: String(d.num_participantes || '').trim(),
    area: String(d.area || '').trim(),
    proyecto: String(d.proyecto || '').trim(), notas: String(d.notas || '').trim(),
    link_doc: /^https?:\/\//i.test(String(d.link_doc || '')) ? String(d.link_doc).trim() : '',
    link_admin: '', mostrar_proyeccion: 'TRUE', mostrar_participantes: 'TRUE', actualizado: ahora_()
  });
  aprender_('areas', d.area);
  aprender_('proyectos', d.proyecto);
  return json_({ ok: true, id: id });
}

function accionEstatus_(d) {
  exigirClave_(d);
  var estatus = norm_(d.estatus);
  if (ESTATUS_VALIDOS.indexOf(estatus) === -1) throw new Error('Estatus no válido.');
  if (!actualizar_('reservaciones', d.id, { estatus: estatus, actualizado: ahora_() })) throw new Error('No se encontró esa reservación.');
  return json_({ ok: true });
}

function camposEditables_(d) {
  var mapa = { sala_id:'sala_id', nombre:'nombre', tema:'tema', participantes:'participantes',
               num_participantes:'num_participantes', area:'area',
               proyecto:'proyecto', notas:'notas', link_doc:'link_doc', link_admin:'link_admin' };
  var cambios = {};
  Object.keys(mapa).forEach(function (k) { if (d[k] !== undefined) cambios[mapa[k]] = String(d[k] || '').trim(); });
  if (d.fecha !== undefined) cambios.fecha = fecha_(d.fecha);
  if (d.inicio !== undefined) cambios.inicio = hora_(d.inicio);
  if (d.fin !== undefined) cambios.fin = hora_(d.fin);
  if (d.estatus !== undefined) {
    var st = norm_(d.estatus);
    if (ESTATUS_VALIDOS.indexOf(st) === -1) throw new Error('Estatus no válido.');
    cambios.estatus = st;
  }
  if (d.mostrar_proyeccion !== undefined) cambios.mostrar_proyeccion = bool_(d.mostrar_proyeccion, true) ? 'TRUE' : 'FALSE';
  if (d.mostrar_participantes !== undefined) cambios.mostrar_participantes = bool_(d.mostrar_participantes, true) ? 'TRUE' : 'FALSE';
  if (cambios.link_doc !== undefined && !/^https?:\/\//i.test(cambios.link_doc)) cambios.link_doc = '';
  if (cambios.link_admin !== undefined && !/^https?:\/\//i.test(cambios.link_admin)) cambios.link_admin = '';
  cambios.actualizado = ahora_();
  return cambios;
}

function accionCrear_(d) {
  exigirClave_(d);
  if (!d.sala_id || !d.fecha || !d.inicio || !d.fin || !String(d.nombre || '').trim()) throw new Error('Faltan datos.');
  var id = nuevoId_();
  var fila = camposEditables_(d);
  fila.id = id;
  fila.creado = ahora_();
  if (!fila.estatus) fila.estatus = 'aceptada';
  if (fila.mostrar_proyeccion === undefined) fila.mostrar_proyeccion = 'TRUE';
  if (fila.mostrar_participantes === undefined) fila.mostrar_participantes = 'TRUE';
  escribir_('reservaciones', fila);
  aprender_('areas', d.area);
  aprender_('proyectos', d.proyecto);
  return json_({ ok: true, id: id });
}

function accionEditar_(d) {
  exigirClave_(d);
  if (!d.id) throw new Error('Falta el identificador.');
  if (!actualizar_('reservaciones', d.id, camposEditables_(d))) throw new Error('No se encontró esa reservación.');
  if (d.area) aprender_('areas', d.area);
  if (d.proyecto) aprender_('proyectos', d.proyecto);
  return json_({ ok: true });
}

function accionEliminar_(d) {
  exigirClave_(d);
  if (!borrar_('reservaciones', d.id)) throw new Error('No se encontró esa reservación.');
  return json_({ ok: true });
}

function accionCatalogo_(d) {
  exigirClave_(d);
  var llave = norm_(d.lista);
  if (['salas', 'areas', 'proyectos'].indexOf(llave) === -1) throw new Error('Catálogo no válido.');
  if (d.op === 'eliminar') {
    if (llave === 'salas') {
      if (!borrar_('salas', d.id)) throw new Error('No se encontró esa sala.');
    } else {
      // En áreas y proyectos el identificador que manda la página es el propio nombre.
      var h = filas_(llave), quitada = false;
      for (var i = h.lista.length - 1; i >= 0 && !quitada; i--) {
        var r = h.lista[i].datos;
        if (String(r.id) === String(d.id) || norm_(r.nombre) === norm_(d.id)) { h.sh.deleteRow(h.lista[i].fila); quitada = true; }
      }
      if (!quitada) throw new Error('No se encontró en la lista.');
    }
    return json_({ ok: true });
  }
  var nombre = String(d.nombre || '').trim();
  if (!nombre) throw new Error('Escribe el nombre.');
  if (llave === 'salas') {
    var capacidad = String(d.capacidad || '').trim();
    if (d.id) {
      if (!actualizar_('salas', d.id, capacidad ? { nombre: nombre, capacidad: capacidad } : { nombre: nombre })) throw new Error('No se encontró esa sala.');
      return json_({ ok: true, id: d.id });
    }
    var idNueva = slug_(nombre);
    if (leerSalas_().some(function (s) { return s.id === idNueva; })) idNueva = idNueva + String(Date.now()).slice(-3);
    escribir_('salas', { id: idNueva, nombre: nombre, capacidad: capacidad || '' });
    return json_({ ok: true, id: idNueva });
  }
  // Áreas y proyectos: con id se renombra, sin id se agrega.
  var hh = filas_(llave);
  for (var j = 0; j < hh.lista.length; j++) {
    var dd = hh.lista[j].datos;
    if (d.id && (String(dd.id) === String(d.id) || norm_(dd.nombre) === norm_(d.id))) {
      var col = hh.cols.indexOf('nombre');
      hh.sh.getRange(hh.lista[j].fila, col + 1).setValue(nombre);
      return json_({ ok: true });
    }
  }
  if (leerLista_(llave).some(function (x) { return norm_(x.nombre) === norm_(nombre); })) return json_({ ok: true, repetida: true });
  escribir_(llave, { id: slug_(nombre) + String(Date.now()).slice(-4), nombre: nombre });
  return json_({ ok: true });
}

function accionBloqueoGuardar_(d) {
  exigirClave_(d);
  if (!d.sala_id) throw new Error('Falta la sala.');
  var fechas = String(d.fechas || '').split(',').map(function (f) { return fecha_(f); }).filter(String);
  if (!fechas.length) throw new Error('Falta la fecha del bloqueo.');
  var inicio = hora_(d.inicio), fin = hora_(d.fin);
  if ((inicio && !fin) || (!inicio && fin)) throw new Error('Pon las dos horas, o déjalas vacías para todo el día.');
  if (inicio && fin && aMin_(inicio) >= aMin_(fin)) throw new Error('La hora final debe ser después de la inicial.');
  var fila = {
    sala_id: String(d.sala_id), tipo: String(d.tipo || 'dia'), mes: String(d.mes || ''), dias: String(d.dias || ''),
    fechas: fechas.join(','), inicio: inicio, fin: fin,
    motivo: String(d.motivo || '').trim(), descripcion: String(d.descripcion || '').trim(),
    mostrar_tablero: bool_(d.mostrar_tablero, true) ? 'TRUE' : 'FALSE'
  };
  if (d.id) {
    if (!actualizar_('bloqueos', d.id, fila)) throw new Error('No se encontró ese bloqueo.');
    return json_({ ok: true, id: d.id });
  }
  fila.id = nuevoId_();
  escribir_('bloqueos', fila);
  return json_({ ok: true, id: fila.id });
}

function accionBloqueoEliminar_(d) {
  exigirClave_(d);
  if (!borrar_('bloqueos', d.id)) throw new Error('No se encontró ese bloqueo.');
  return json_({ ok: true });
}

/* ============================================================
   Para correr a mano desde el editor (menú Ejecutar)
   ============================================================ */
// Crea o completa todas las hojas sin tocar lo que ya tengas.
function prepararHojas() {
  ['salas', 'reservaciones', 'areas', 'proyectos', 'bloqueos'].forEach(function (k) { hoja_(k); });
  SpreadsheetApp.getActiveSpreadsheet().toast('Hojas y columnas listas.', 'Agenda de salas', 5);
}
// Cambia la clave del panel (edita el valor y ejecuta esta función una vez).
function guardarClave() {
  var NUEVA = 'cambia-esta-clave';
  PropertiesService.getScriptProperties().setProperty('CLAVE_ADMIN', NUEVA);
}

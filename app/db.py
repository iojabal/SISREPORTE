import psycopg2
import psycopg2.extras
from datetime import date
from typing import Optional
from .config import CONNECTION_PARAMS


def get_connection():
    """Abre una nueva conexión a PostgreSQL. Se cierra siempre con 'with'."""
    return psycopg2.connect(**CONNECTION_PARAMS)


# ============================================================
# CAMPAMENTOS (tabla maestra)
# ============================================================

def listar_campamentos(solo_activos: bool = True):
    query = "SELECT id, nombre, orden, activo FROM campamentos"
    if solo_activos:
        query += " WHERE activo = TRUE"
    query += " ORDER BY orden, nombre"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]


def crear_campamento(nombre: str, orden: int = 0):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO campamentos (nombre, orden) VALUES (%s, %s)",
                (nombre, orden)
            )
        conn.commit()


def actualizar_campamento(campamento_id: int, nombre: str, orden: int, activo: bool):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE campamentos SET nombre = %s, orden = %s, activo = %s WHERE id = %s",
                (nombre, orden, activo, campamento_id)
            )
        conn.commit()


def eliminar_campamento(campamento_id: int):
    # Borrado lógico, no físico, para no romper reportes históricos que ya lo usaron
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE campamentos SET activo = FALSE WHERE id = %s",
                (campamento_id,)
            )
        conn.commit()


# ============================================================
# REPORTES
# ============================================================

def crear_reporte(fecha: date, responsable: Optional[str], usuario: Optional[str], detalles: list):
    """
    detalles: lista de dicts con
      campamento_id, federacion, central, sindicato,
      erradicado, total_erradicado, mensura, total_mensura, alm, errad, lotes, parcelas,
      encargado_camp, observaciones
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """INSERT INTO reporte_campamentos_cabecera (fecha, responsable, usuario_creacion)
                   VALUES (%s, %s, %s)
                   RETURNING id""",
                (fecha, responsable, usuario)
            )
            reporte_id = cursor.fetchone()[0]

            for d in detalles:
                cursor.execute(
                    """INSERT INTO reporte_campamentos_detalle
                       (reporte_id, campamento_id, federacion, central, sindicato,
                        erradicado, total_erradicado, mensura, total_mensura, alm, errad, lotes, parcelas,
                        encargado_camp, observaciones)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (reporte_id, d.get("campamento_id"), d.get("federacion"),
                     d.get("central"), d.get("sindicato"),
                     d.get("erradicado"), d.get("total_erradicado"),
                     d.get("mensura"), d.get("total_mensura"),
                     d.get("alm"), d.get("errad"), d.get("lotes"), d.get("parcelas"),
                     d.get("encargado_camp"), d.get("observaciones"))
                )
        conn.commit()
        return reporte_id


def obtener_reporte(reporte_id: int):
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, fecha, responsable, fecha_creacion, usuario_creacion "
                "FROM reporte_campamentos_cabecera WHERE id = %s",
                (reporte_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            cabecera = dict(row)

            cursor.execute(
                """SELECT d.id, d.campamento_id, c.nombre AS campamento,
                          d.federacion, d.central, d.sindicato,
                          d.erradicado, d.total_erradicado, d.mensura, d.total_mensura,
                          d.alm, d.errad, d.lotes, d.parcelas,
                          d.encargado_camp, d.observaciones
                   FROM reporte_campamentos_detalle d
                   JOIN campamentos c ON c.id = d.campamento_id
                   WHERE d.reporte_id = %s
                   ORDER BY c.orden, c.nombre""",
                (reporte_id,)
            )
            detalles = [dict(row) for row in cursor.fetchall()]

            cabecera["detalles"] = detalles
            return cabecera


def listar_reportes(limite: int = 50):
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                """SELECT id, fecha, responsable, fecha_creacion
                   FROM reporte_campamentos_cabecera
                   ORDER BY fecha DESC, id DESC
                   LIMIT %s""",
                (limite,)
            )
            return [dict(row) for row in cursor.fetchall()]


def obtener_totales_resumen(fecha: date):
    """Totales de erradicado/mensura: del día seleccionado, del mes y del año
    de ESA MISMA fecha (no la fecha real del servidor) — así "Mes" y "Año"
    quedan consistentes con lo que se está viendo en "Hoy". "Hasta la fecha"
    se calcula respecto a la fecha seleccionada, no a CURRENT_DATE, para que
    ver un reporte de un mes/año pasado no muestre acumulados de meses
    futuros dentro de ese mismo período. Para el día se distingue
    "no hay reporte guardado" de "reporte con total 0"."""
    suma_sql = """SELECT
                      SUM(COALESCE(d.erradicado, 0)) AS erradicado,
                      SUM(COALESCE(d.mensura, 0)) AS mensura
                  FROM reporte_campamentos_detalle d
                  JOIN reporte_campamentos_cabecera c ON c.id = d.reporte_id
                  WHERE """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                "SELECT 1 FROM reporte_campamentos_cabecera WHERE fecha = %s LIMIT 1",
                (fecha,)
            )
            existe_dia = cursor.fetchone() is not None

            cursor.execute(suma_sql + "c.fecha = %s", (fecha,))
            dia = dict(cursor.fetchone())

            cursor.execute(
                suma_sql + """EXTRACT(YEAR FROM c.fecha) = %s
                     AND EXTRACT(MONTH FROM c.fecha) = %s
                     AND c.fecha <= %s""",
                (fecha.year, fecha.month, fecha)
            )
            mes = dict(cursor.fetchone())

            cursor.execute(
                suma_sql + """EXTRACT(YEAR FROM c.fecha) = %s
                     AND c.fecha <= %s""",
                (fecha.year, fecha)
            )
            anio = dict(cursor.fetchone())

    return {
        "dia": {
            "existe": existe_dia,
            "erradicado": float(dia["erradicado"] or 0),
            "mensura": float(dia["mensura"] or 0),
        },
        "mes": {
            "erradicado": float(mes["erradicado"] or 0),
            "mensura": float(mes["mensura"] or 0),
        },
        "anio": {
            "erradicado": float(anio["erradicado"] or 0),
            "mensura": float(anio["mensura"] or 0),
        },
    }


def obtener_reporte_por_fecha(fecha: date):
    """Busca si ya existe un reporte para esa fecha (para editar en vez de duplicar)."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM reporte_campamentos_cabecera WHERE fecha = %s ORDER BY id DESC LIMIT 1",
                (fecha,)
            )
            row = cursor.fetchone()
            return row[0] if row else None


def eliminar_reporte(reporte_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # ON DELETE CASCADE en el detalle se encarga de borrar las filas hijas
            cursor.execute("DELETE FROM reporte_campamentos_cabecera WHERE id = %s", (reporte_id,))
        conn.commit()


# ============================================================
# CLASIFICACIÓN DE FEDERACIONES
# (qué federaciones son "Parque/Zona No Autorizada"; el resto
#  se asume "Área Legal" por defecto)
# ============================================================

def listar_clasificacion(solo_activas: bool = True):
    query = "SELECT id, nombre, bloque, orden, activo FROM clasificacion_federaciones"
    if solo_activas:
        query += " WHERE activo = TRUE"
    query += " ORDER BY bloque, orden, nombre"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]


def listar_federaciones_todas():
    """
    Catálogo completo para el selector de "Federación" del reporte diario:
    une clasificacion_federaciones (parques/zonas ilegales) con
    clasificacion_zona_departamento (que sí incluye las de Área Legal,
    además de repetir las ilegales) y devuelve nombres únicos.
    clasificacion_federaciones por sí sola NO basta: por diseño solo
    guarda las "excepciones" (lo que no es Área Legal), así que de
    usarla sola el selector queda sin las federaciones de Área Legal.
    """
    nombres = set()
    for c in listar_clasificacion(solo_activas=True):
        nombres.add(c["nombre"])
    for z in listar_zona_departamento(solo_activas=True):
        nombres.add(z["nombre"])
    return sorted(nombres)


def crear_clasificacion(nombre: str, bloque: str, orden: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO clasificacion_federaciones (nombre, bloque, orden) VALUES (%s, %s, %s)",
                (nombre.strip().upper(), bloque, orden)
            )
        conn.commit()


def actualizar_clasificacion(clasificacion_id: int, nombre: str, bloque: str, orden: int, activo: bool):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE clasificacion_federaciones
                   SET nombre = %s, bloque = %s, orden = %s, activo = %s
                   WHERE id = %s""",
                (nombre.strip().upper(), bloque, orden, activo, clasificacion_id)
            )
        conn.commit()


def eliminar_clasificacion(clasificacion_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM clasificacion_federaciones WHERE id = %s", (clasificacion_id,))
        conn.commit()


# ============================================================
# VISTA 1: AGRUPADO POR FEDERACIÓN (Imagen 1 del formato original)
#
# Toma reporte_campamentos_detalle del día solicitado, agrupa por
# el texto exacto del campo "federacion", y suma TOTAL_RED, TOTAL_MEN,
# ALM, ERRAD, LOTES, PARCELAS. No es captura nueva — es 100% derivado.
# ============================================================

def obtener_resumen_por_federacion(fecha: date):
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                """SELECT
                       COALESCE(d.federacion, '(SIN FEDERACIÓN)') AS federacion,
                       -- Tomamos el primer central/sindicato no vacío como referencia
                       -- (si hay varias filas con la misma federación, se listan aparte)
                       SUM(COALESCE(d.erradicado, 0)) AS erradicada,
                       SUM(COALESCE(d.mensura, 0)) AS mensura,
                       SUM(COALESCE(d.alm, 0)) AS alm,
                       SUM(COALESCE(d.errad, 0)) AS errad,
                       SUM(COALESCE(d.lotes, 0)) AS lotes,
                       SUM(COALESCE(d.parcelas, 0)) AS parcelas
                   FROM reporte_campamentos_detalle d
                   JOIN reporte_campamentos_cabecera c ON c.id = d.reporte_id
                   WHERE c.fecha = %s
                   GROUP BY d.federacion
                   ORDER BY d.federacion""",
                (fecha,)
            )
            filas = [dict(row) for row in cursor.fetchall()]

    for f in filas:
        f["erradicada"] = float(f["erradicada"] or 0)
        f["mensura"] = float(f["mensura"] or 0)
        f["alm"] = float(f["alm"] or 0)
        f["errad"] = int(f["errad"] or 0)
        f["lotes"] = int(f["lotes"] or 0)
        f["parcelas"] = int(f["parcelas"] or 0)
        f["total"] = f["erradicada"] + f["mensura"]

    return filas


# ============================================================
# VISTA 2: ÁREA LEGAL / PARQUES, CON ACUMULADO ANUAL
# (Imágenes 2 y 3 del formato original)
#
# Reutiliza la Vista 1 (agrupado por federación) tanto para el día
# solicitado como para CADA día del año, sumando todo, y clasifica
# cada federación como área_legal / parque_cbba_lp_beni / parque_santa_cruz
# según la tabla clasificacion_federaciones.
# ============================================================

def _normalizar_nombre(nombre: str) -> str:
    """
    Normaliza nombres de federación para comparar de forma tolerante:
    el catálogo guarda 'F.U.C.U.' pero el usuario puede escribir 'F.U.C.U'
    o 'f u c u' en el reporte diario — sin esto, la comparación exacta de
    texto falla y esas filas quedan sin clasificar.
    """
    return (nombre or "").strip().upper().replace(".", "").replace(" ", "")


def _clasificar(nombre_federacion: str, clasificacion: dict) -> str:
    clave = _normalizar_nombre(nombre_federacion)
    return clasificacion.get(clave, "area_legal")


def obtener_resumen_areas_legales(fecha: date):
    anio = fecha.year
    clasif_rows = listar_clasificacion(solo_activas=True)
    clasificacion = {_normalizar_nombre(c["nombre"]): c["bloque"] for c in clasif_rows}

    # Día puntual
    resumen_dia = obtener_resumen_por_federacion(fecha)

    # Acumulado del año completo: sumar la agrupación por federación
    # de TODOS los días del año que tengan reporte guardado.
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                """SELECT
                       COALESCE(d.federacion, '(SIN FEDERACIÓN)') AS federacion,
                       SUM(COALESCE(d.erradicado, 0)) AS erradicada,
                       SUM(COALESCE(d.mensura, 0)) AS mensura,
                       SUM(COALESCE(d.alm, 0)) AS alm,
                       SUM(COALESCE(d.errad, 0)) AS errad,
                       SUM(COALESCE(d.lotes, 0)) AS lotes,
                       SUM(COALESCE(d.parcelas, 0)) AS parcelas
                   FROM reporte_campamentos_detalle d
                   JOIN reporte_campamentos_cabecera c ON c.id = d.reporte_id
                   WHERE EXTRACT(YEAR FROM c.fecha) = %s
                   GROUP BY d.federacion""",
                (anio,)
            )
            acumulado_rows = [dict(row) for row in cursor.fetchall()]

    # Todo lo siguiente se compara por nombre NORMALIZADO (sin puntos, sin
    # espacios, mayúsculas) porque el usuario puede escribir "F.U.C.U" en el
    # reporte diario aunque el catálogo lo tenga guardado como "F.U.C.U." —
    # sin esto, la comparación exacta de texto fallaba y todo salía en 0.
    dia_por_fed = {_normalizar_nombre(f["federacion"]): f for f in resumen_dia}
    acumulado_por_fed = {_normalizar_nombre(r["federacion"]): r for r in acumulado_rows}

    # Nombre "bonito" para mostrar: se prefiere el del catálogo de
    # clasificación (formato consistente), si no existe se usa el que
    # escribió el usuario en el reporte.
    nombre_por_clave = {_normalizar_nombre(c["nombre"]): c["nombre"] for c in clasif_rows}
    for f in resumen_dia:
        nombre_por_clave.setdefault(_normalizar_nombre(f["federacion"]), f["federacion"])
    for r in acumulado_rows:
        nombre_por_clave.setdefault(_normalizar_nombre(r["federacion"]), r["federacion"])

    # Combinar día + acumulado + catálogo de clasificación. Se incluye
    # también lo configurado en clasificacion_federaciones aunque no tenga
    # datos ese día/año, para que siempre aparezca con 0 en vez de quedar
    # ausente (igual que la vista de Zona/Departamento).
    federaciones_vistas = (
        set(dia_por_fed.keys())
        | set(acumulado_por_fed.keys())
        | set(clasificacion.keys())
    )

    bloques = {"area_legal": [], "parque_cbba_lp_beni": [], "parque_santa_cruz": []}

    for fed in sorted(federaciones_vistas, key=lambda clave: nombre_por_clave.get(clave, clave)):
        dia = dia_por_fed.get(fed, {})
        acum = acumulado_por_fed.get(fed, {})
        bloque = clasificacion.get(fed, "area_legal")

        bloques[bloque].append({
            "federacion": nombre_por_clave.get(fed, fed),
            "erradicada_dia": float(dia.get("erradicada") or 0),
            "mensura_dia": float(dia.get("mensura") or 0),
            "alm_dia": float(dia.get("alm") or 0),
            "lotes_dia": float(dia.get("lotes") or 0),
            "poligonos_dia": float(dia.get("parcelas") or 0),  # #Polígonos = suma de "Parcelas" de la tabla inicial
            "total_erradicada_anio": float(acum.get("erradicada") or 0),
            "total_mensura_anio": float(acum.get("mensura") or 0),
            "total_alm_anio": float(acum.get("alm") or 0),
            "total_lotes_anio": int(acum.get("lotes") or 0),
            "total_poligonos_anio": int(acum.get("parcelas") or 0),
        })

    def subtotal(lista, campo):
        return sum(item[campo] for item in lista)

    # Total general de la página: erradicación + mensura + lotes + polígonos + alm.,
    # día y acumulado año, sumando los tres bloques (área legal + parques).
    todas_las_filas = bloques["area_legal"] + bloques["parque_cbba_lp_beni"] + bloques["parque_santa_cruz"]
    lotes_dia = subtotal(todas_las_filas, "lotes_dia")
    poligonos_dia = subtotal(todas_las_filas, "poligonos_dia")
    total_lotes_anio = subtotal(todas_las_filas, "total_lotes_anio")
    total_poligonos_anio = subtotal(todas_las_filas, "total_poligonos_anio")

    total_general = {
        "erradicada_dia": subtotal(todas_las_filas, "erradicada_dia"),
        "total_erradicada_anio": subtotal(todas_las_filas, "total_erradicada_anio"),
        "mensura_dia": subtotal(todas_las_filas, "mensura_dia"),
        "total_mensura_anio": subtotal(todas_las_filas, "total_mensura_anio"),
        "lotes_dia": lotes_dia,
        "total_lotes_anio": total_lotes_anio,
        "poligonos_dia": poligonos_dia,
        "total_poligonos_anio": total_poligonos_anio,
        "alm_dia": subtotal(todas_las_filas, "alm_dia"),
        "total_alm_anio": subtotal(todas_las_filas, "total_alm_anio"),
    }

    return {
        "fecha": fecha.isoformat(),
        "anio": anio,
        "area_legal": bloques["area_legal"],
        "parque_cbba_lp_beni": bloques["parque_cbba_lp_beni"],
        "parque_santa_cruz": bloques["parque_santa_cruz"],
        "total_general": total_general,
        "subtotales": {
            "area_legal": {
                "erradicada_dia": subtotal(bloques["area_legal"], "erradicada_dia"),
                "mensura_dia": subtotal(bloques["area_legal"], "mensura_dia"),
                "alm_dia": subtotal(bloques["area_legal"], "alm_dia"),
                "total_erradicada_anio": subtotal(bloques["area_legal"], "total_erradicada_anio"),
                "total_mensura_anio": subtotal(bloques["area_legal"], "total_mensura_anio"),
                "total_alm_anio": subtotal(bloques["area_legal"], "total_alm_anio"),
            },
            "parque_cbba_lp_beni": {
                "erradicada_dia": subtotal(bloques["parque_cbba_lp_beni"], "erradicada_dia"),
                "alm_dia": subtotal(bloques["parque_cbba_lp_beni"], "alm_dia"),
                "total_erradicada_anio": subtotal(bloques["parque_cbba_lp_beni"], "total_erradicada_anio"),
                "total_alm_anio": subtotal(bloques["parque_cbba_lp_beni"], "total_alm_anio"),
            },
            "parque_santa_cruz": {
                "erradicada_dia": subtotal(bloques["parque_santa_cruz"], "erradicada_dia"),
                "alm_dia": subtotal(bloques["parque_santa_cruz"], "alm_dia"),
                "total_erradicada_anio": subtotal(bloques["parque_santa_cruz"], "total_erradicada_anio"),
                "total_alm_anio": subtotal(bloques["parque_santa_cruz"], "total_alm_anio"),
            },
        }
    }


# ============================================================
# VISTA "POR ZONA / DEPARTAMENTO"
# (Zona Autorizada/No Autorizada + tabla de Departamento con
#  #Polígonos — segunda forma de agrupar los mismos datos de
#  reporte_campamentos_detalle, separada de "Área Legal y Parques")
# ============================================================

def listar_zona_departamento(solo_activas: bool = True):
    query = "SELECT id, nombre, zona, departamento, orden, activo FROM clasificacion_zona_departamento"
    if solo_activas:
        query += " WHERE activo = TRUE"
    query += " ORDER BY departamento, zona, orden, nombre"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]


def crear_zona_departamento(nombre: str, zona: str, departamento: str, orden: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO clasificacion_zona_departamento (nombre, zona, departamento, orden) VALUES (%s, %s, %s, %s)",
                (nombre.strip().upper(), zona, departamento.strip().upper(), orden)
            )
        conn.commit()


def actualizar_zona_departamento(item_id: int, nombre: str, zona: str, departamento: str, orden: int, activo: bool):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE clasificacion_zona_departamento
                   SET nombre = %s, zona = %s, departamento = %s, orden = %s, activo = %s
                   WHERE id = %s""",
                (nombre.strip().upper(), zona, departamento.strip().upper(), orden, activo, item_id)
            )
        conn.commit()


def eliminar_zona_departamento(item_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM clasificacion_zona_departamento WHERE id = %s", (item_id,))
        conn.commit()


def obtener_resumen_zona_departamento(fecha: date):
    """
    Agrupa reporte_campamentos_detalle del día por (zona, departamento),
    usando clasificacion_zona_departamento para saber a qué zona/depto
    pertenece cada federación capturada. El mismo nombre de federación
    puede aparecer en más de un departamento (ej. T.I.P.N.I.S. en
    Cochabamba y en Beni) — en ese caso, el valor del día se cuenta en
    AMBOS departamentos (no se divide), salvo que se indique lo contrario.
    """
    resumen_dia = obtener_resumen_por_federacion(fecha)
    # Comparación por nombre normalizado (sin puntos/espacios, mayúsculas):
    # el catálogo guarda "F.U.C.U." pero el usuario puede escribir "F.U.C.U"
    # en el reporte diario — con comparación exacta de texto, esa fila no
    # hacía match y quedaba en 0 aunque sí había datos cargados.
    dia_por_fed = {_normalizar_nombre(f["federacion"]): f for f in resumen_dia}

    zonas_rows = listar_zona_departamento(solo_activas=True)

    bloques = {
        ("autorizada", "COCHABAMBA"): [],
        ("no_autorizada", "COCHABAMBA"): [],
        ("no_autorizada", "BENI"): [],
        ("no_autorizada", "SANTA CRUZ"): [],
    }

    for z in zonas_rows:
        clave = (z["zona"], z["departamento"])
        dia = dia_por_fed.get(_normalizar_nombre(z["nombre"]), {})
        fila = {
            "nombre": z["nombre"],
            "erradicada_dia": float(dia.get("erradicada") or 0),
            "alm_dia": float(dia.get("alm") or 0),
        }
        if clave in bloques:
            bloques[clave].append(fila)
        else:
            bloques.setdefault(clave, []).append(fila)

    def total_bloque(lista):
        return {
            "erradicada_dia": sum(f["erradicada_dia"] for f in lista),
            "alm_dia": sum(f["alm_dia"] for f in lista),
        }

    # Tabla de Departamento: suma TODO lo que está en ese departamento
    # (autorizada + no_autorizada), más conteo de polígonos (= "Parcelas"
    # de la tabla del Reporte de Campamentos)
    poligonos_por_fed = {_normalizar_nombre(f["federacion"]): f.get("parcelas", 0) for f in resumen_dia}

    departamentos = ["COCHABAMBA", "SANTA CRUZ", "BENI", "LA PAZ"]
    resumen_departamentos = []
    for depto in departamentos:
        nombres_depto = set(_normalizar_nombre(z["nombre"]) for z in zonas_rows if z["departamento"] == depto)
        erradicada = sum(dia_por_fed.get(n, {}).get("erradicada", 0) for n in nombres_depto)
        alm = sum(dia_por_fed.get(n, {}).get("alm", 0) for n in nombres_depto)
        poligonos = sum(poligonos_por_fed.get(n, 0) for n in nombres_depto)
        resumen_departamentos.append({
            "departamento": depto,
            "poligonos": poligonos,
            "erradicada_dia": erradicada,
            "alm_dia": alm,
        })

    total_general = {
        "poligonos": sum(d["poligonos"] for d in resumen_departamentos),
        "erradicada_dia": sum(d["erradicada_dia"] for d in resumen_departamentos),
        "alm_dia": sum(d["alm_dia"] for d in resumen_departamentos),
    }

    return {
        "fecha": fecha.isoformat(),
        "zona_autorizada_cochabamba": bloques.get(("autorizada", "COCHABAMBA"), []),
        "zona_no_autorizada_cochabamba": bloques.get(("no_autorizada", "COCHABAMBA"), []),
        "zona_no_autorizada_beni": bloques.get(("no_autorizada", "BENI"), []),
        "zona_no_autorizada_santa_cruz": bloques.get(("no_autorizada", "SANTA CRUZ"), []),
        "subtotales": {
            "zona_autorizada_cochabamba": total_bloque(bloques.get(("autorizada", "COCHABAMBA"), [])),
            "zona_no_autorizada_cochabamba": total_bloque(bloques.get(("no_autorizada", "COCHABAMBA"), [])),
            "zona_no_autorizada_beni": total_bloque(bloques.get(("no_autorizada", "BENI"), [])),
            "zona_no_autorizada_santa_cruz": total_bloque(bloques.get(("no_autorizada", "SANTA CRUZ"), [])),
        },
        "departamentos": resumen_departamentos,
        "total_general": total_general,
    }

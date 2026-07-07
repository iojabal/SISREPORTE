from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import date
import psycopg2

from . import db
from .models import (
    CampamentoIn, CampamentoUpdate, ReporteIn,
    ClasificacionIn, ClasificacionUpdate,
    ZonaDepartamentoIn, ZonaDepartamentoUpdate
)

app = FastAPI(title="Reporte Diario de Campamentos")

# Permitir acceso desde cualquier PC de la red local (ajustar si se quiere restringir)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Manejo de errores de conexión a la base, para no devolver
# un error 500 críptico si PostgreSQL no responde
# ============================================================
@app.exception_handler(psycopg2.Error)
def handle_db_error(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=503,
        content={"error": "No se pudo conectar a la base de datos. Verifique que PostgreSQL esté disponible.",
                  "detalle": str(exc)}
    )


# ============================================================
# CAMPAMENTOS
# ============================================================

@app.get("/api/campamentos")
def api_listar_campamentos(solo_activos: bool = True):
    return db.listar_campamentos(solo_activos)


@app.post("/api/campamentos")
def api_crear_campamento(c: CampamentoIn):
    db.crear_campamento(c.nombre, c.orden)
    return {"ok": True}


@app.put("/api/campamentos/{campamento_id}")
def api_actualizar_campamento(campamento_id: int, c: CampamentoUpdate):
    db.actualizar_campamento(campamento_id, c.nombre, c.orden, c.activo)
    return {"ok": True}


@app.delete("/api/campamentos/{campamento_id}")
def api_eliminar_campamento(campamento_id: int):
    db.eliminar_campamento(campamento_id)
    return {"ok": True}


# ============================================================
# REPORTES
# ============================================================

@app.get("/api/reportes")
def api_listar_reportes(limite: int = 50):
    return db.listar_reportes(limite)


@app.get("/api/totales-resumen/{fecha}")
def api_totales_resumen(fecha: date):
    return db.obtener_totales_resumen(fecha)


@app.get("/api/reportes/{reporte_id}")
def api_obtener_reporte(reporte_id: int):
    reporte = db.obtener_reporte(reporte_id)
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return reporte


@app.get("/api/reportes/fecha/{fecha}")
def api_obtener_reporte_por_fecha(fecha: date):
    reporte_id = db.obtener_reporte_por_fecha(fecha)
    if not reporte_id:
        return {"existe": False}
    return {"existe": True, "reporte_id": reporte_id}


@app.post("/api/reportes")
def api_crear_reporte(r: ReporteIn):
    detalles = [d.model_dump() for d in r.detalles]
    reporte_id = db.crear_reporte(r.fecha, r.responsable, r.usuario, detalles)
    return {"ok": True, "reporte_id": reporte_id}


@app.delete("/api/reportes/{reporte_id}")
def api_eliminar_reporte(reporte_id: int):
    db.eliminar_reporte(reporte_id)
    return {"ok": True}


# ============================================================
# CLASIFICACIÓN DE FEDERACIONES (config de las vistas derivadas)
# ============================================================

@app.get("/api/clasificacion-federaciones")
def api_listar_clasificacion(solo_activas: bool = True):
    return db.listar_clasificacion(solo_activas)


@app.get("/api/federaciones-todas")
def api_listar_federaciones_todas():
    """Catálogo completo (Área Legal + Parques/Zonas Ilegales) para el selector del reporte diario."""
    return db.listar_federaciones_todas()


@app.post("/api/clasificacion-federaciones")
def api_crear_clasificacion(c: ClasificacionIn):
    db.crear_clasificacion(c.nombre, c.bloque, c.orden)
    return {"ok": True}


@app.put("/api/clasificacion-federaciones/{clasificacion_id}")
def api_actualizar_clasificacion(clasificacion_id: int, c: ClasificacionUpdate):
    db.actualizar_clasificacion(clasificacion_id, c.nombre, c.bloque, c.orden, c.activo)
    return {"ok": True}


@app.delete("/api/clasificacion-federaciones/{clasificacion_id}")
def api_eliminar_clasificacion(clasificacion_id: int):
    db.eliminar_clasificacion(clasificacion_id)
    return {"ok": True}


# ============================================================
# VISTAS DERIVADAS (solo lectura — se calculan de los Campamentos)
# ============================================================

@app.get("/api/resumen-por-federacion/{fecha}")
def api_resumen_por_federacion(fecha: date):
    return db.obtener_resumen_por_federacion(fecha)


@app.get("/api/resumen-areas-legales/{fecha}")
def api_resumen_areas_legales(fecha: date):
    return db.obtener_resumen_areas_legales(fecha)


# ============================================================
# CLASIFICACIÓN POR ZONA/DEPARTAMENTO (config de la 2da vista derivada)
# ============================================================

@app.get("/api/zona-departamento")
def api_listar_zona_departamento(solo_activas: bool = True):
    return db.listar_zona_departamento(solo_activas)


@app.post("/api/zona-departamento")
def api_crear_zona_departamento(z: ZonaDepartamentoIn):
    db.crear_zona_departamento(z.nombre, z.zona, z.departamento, z.orden)
    return {"ok": True}


@app.put("/api/zona-departamento/{item_id}")
def api_actualizar_zona_departamento(item_id: int, z: ZonaDepartamentoUpdate):
    db.actualizar_zona_departamento(item_id, z.nombre, z.zona, z.departamento, z.orden, z.activo)
    return {"ok": True}


@app.delete("/api/zona-departamento/{item_id}")
def api_eliminar_zona_departamento(item_id: int):
    db.eliminar_zona_departamento(item_id)
    return {"ok": True}


@app.get("/api/resumen-zona-departamento/{fecha}")
def api_resumen_zona_departamento(fecha: date):
    return db.obtener_resumen_zona_departamento(fecha)


# ============================================================
# Servir el frontend (HTML/JS estático)
# ============================================================
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/reporte/{reporte_id}")
def ver_reporte_html(reporte_id: int):
    return FileResponse("static/reporte.html")


@app.get("/erradicacion")
def erradicacion_html():
    return FileResponse("static/erradicacion.html")


@app.get("/zonas")
def zonas_html():
    return FileResponse("static/zonas.html")


@app.get("/imprimir")
def imprimir_html():
    """Página combinada: imprime los 3 reportes (Campamentos, Erradicación, Zonas) en un solo documento."""
    return FileResponse("static/imprimir.html")

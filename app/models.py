from pydantic import BaseModel
from typing import Optional, List
from datetime import date


class CampamentoIn(BaseModel):
    nombre: str
    orden: int = 0


class CampamentoUpdate(BaseModel):
    nombre: str
    orden: int
    activo: bool = True


class DetalleIn(BaseModel):
    campamento_id: int
    federacion: Optional[str] = None
    central: Optional[str] = None
    sindicato: Optional[str] = None
    erradicado: Optional[float] = None      # Has. de coca erradicada (E)
    total_erradicado: Optional[float] = None  # Espejo editable (normalmente igual a erradicado)
    mensura: Optional[float] = None         # Has. de coca legal (M)
    total_mensura: Optional[float] = None   # Espejo editable (normalmente igual a mensura)
    alm: Optional[int] = None               # Cantidad de almácigos
    errad: Optional[int] = None             # Número de erradicadores
    lotes: Optional[int] = None             # Lotes trabajados ese día
    parcelas: Optional[int] = None          # Parcelas trabajadas ese día
    encargado_camp: Optional[str] = None
    observaciones: Optional[str] = None


class ReporteIn(BaseModel):
    fecha: date
    responsable: Optional[str] = None
    usuario: Optional[str] = None
    detalles: List[DetalleIn]


# ============================================================
# CLASIFICACIÓN DE FEDERACIONES (para las vistas derivadas)
# ============================================================

class ClasificacionIn(BaseModel):
    nombre: str
    bloque: str  # 'parque_cbba_lp_beni' | 'parque_santa_cruz'
    orden: int = 0


class ClasificacionUpdate(BaseModel):
    nombre: str
    bloque: str
    orden: int
    activo: bool = True


# ============================================================
# CLASIFICACIÓN POR ZONA/DEPARTAMENTO
# ============================================================

class ZonaDepartamentoIn(BaseModel):
    nombre: str
    zona: str  # 'autorizada' | 'no_autorizada'
    departamento: str  # 'COCHABAMBA' | 'BENI' | 'SANTA CRUZ' | 'LA PAZ'
    orden: int = 0


class ZonaDepartamentoUpdate(BaseModel):
    nombre: str
    zona: str
    departamento: str
    orden: int
    activo: bool = True

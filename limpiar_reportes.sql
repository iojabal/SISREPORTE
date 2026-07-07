-- Borra todos los reportes diarios capturados (cabecera + detalle),
-- dejando intactos los catálogos: campamentos, clasificacion_federaciones,
-- clasificacion_zona_departamento.
--
-- Uso:
--   sudo -u postgres psql -d reporte_campamentos -f limpiar_reportes.sql
--
-- El TRUNCATE ... CASCADE borra reporte_campamentos_detalle automáticamente
-- (tiene FK con ON DELETE CASCADE hacia la cabecera, pero TRUNCATE CASCADE
-- lo hace explícito y reinicia los contadores de id con RESTART IDENTITY).

TRUNCATE TABLE reporte_campamentos_cabecera RESTART IDENTITY CASCADE;

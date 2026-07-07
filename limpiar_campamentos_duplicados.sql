-- Limpia nombres de campamento duplicados en la tabla "campamentos"
-- (por ejemplo dos filas "ROJO 1" con id distinto).
--
-- Qué hace:
--   1. Para cada nombre duplicado, conserva la fila con el id MÁS BAJO
--      (la más antigua) y la marca como única activa.
--   2. Cualquier reporte ya guardado que apunte a las filas duplicadas
--      se reasigna a la fila que se conserva (no se pierde el dato).
--   3. Borra las filas duplicadas.
--   4. Intenta agregar la restricción UNIQUE sobre "nombre" para que
--      no se puedan volver a crear duplicados.
--
-- Uso:
--   sudo -u postgres psql -d reporte_campamentos -f limpiar_campamentos_duplicados.sql

BEGIN;

-- Tabla temporal: nombre -> id que se conserva (el más bajo)
CREATE TEMP TABLE _campamentos_a_conservar AS
SELECT nombre, MIN(id) AS id_conservar
FROM campamentos
GROUP BY nombre
HAVING COUNT(*) > 1;

-- Reasignar reportes que apuntaban a los ids duplicados (no al que se conserva)
UPDATE reporte_campamentos_detalle d
SET campamento_id = c.id_conservar
FROM campamentos camp
JOIN _campamentos_a_conservar c ON c.nombre = camp.nombre
WHERE d.campamento_id = camp.id
  AND camp.id <> c.id_conservar;

-- Borrar las filas duplicadas (todas menos la que se conserva)
DELETE FROM campamentos camp
USING _campamentos_a_conservar c
WHERE camp.nombre = c.nombre
  AND camp.id <> c.id_conservar;

DROP TABLE _campamentos_a_conservar;

-- Ahora que no hay duplicados, asegurar la restricción UNIQUE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'campamentos_nombre_key'
    ) THEN
        ALTER TABLE campamentos ADD CONSTRAINT campamentos_nombre_key UNIQUE (nombre);
    END IF;
END $$;

COMMIT;

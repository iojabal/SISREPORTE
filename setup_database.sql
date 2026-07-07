-- ============================================================
-- Script de creación de base y tablas para el sistema de
-- Reporte de Campamentos — PostgreSQL
--
-- Esta es una base COMPLETAMENTE SEPARADA de BDUDESTRO (SQL Server).
-- No depende ni afecta en nada al servidor de SQL Server de producción.
--
-- Campos del detalle (según formato original "REPORTE DIARIO DE
-- CAMPAMENTOS"):
--   E (Erradicada)         -> erradicado          (Has.)
--   Total E (espejo)       -> total_erradicado     (Has., editable, normalmente igual a erradicado)
--   M (Mensura)            -> mensura              (Has.)
--   Total M (espejo)       -> total_mensura        (Has., editable, normalmente igual a mensura)
--   ALM.       -> alm         (cantidad de almácigos)
--   ERRAD.     -> errad       (número de erradicadores)
--   LOTES      -> lotes       (lotes trabajados ese día)
--   PARCELAS   -> parcelas    (parcelas trabajadas ese día)
-- ============================================================

-- NOTA: la base "reporte_campamentos" y el usuario "reportes_app" ya son
-- creados automáticamente por la imagen oficial de Postgres a partir de
-- POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD definidos en .env, antes
-- de que este script corra como initdb.d. NO se vuelven a crear aquí:
-- hacerlo causaría un error (ya existen) y, como el entrypoint usa
-- ON_ERROR_STOP=1, abortaría el resto de este script.

-- Tabla maestra de campamentos (editable desde la app si la lista cambia)
CREATE TABLE IF NOT EXISTS campamentos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Migración: si la tabla ya existía sin la restricción UNIQUE (versiones
-- anteriores de este script no la tenían), agregarla ahora. Si ya hay
-- nombres duplicados de antes, hay que limpiarlos manualmente primero
-- con el DELETE de la sección de notas al final de este archivo.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'campamentos_nombre_key'
    ) THEN
        BEGIN
            ALTER TABLE campamentos ADD CONSTRAINT campamentos_nombre_key UNIQUE (nombre);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'No se pudo agregar UNIQUE a campamentos.nombre (probablemente hay nombres duplicados). Ejecute primero el DELETE de limpieza indicado al final de este archivo.';
        END;
    END IF;
END $$;

-- Cargar la lista inicial vista en el formato original
-- (se puede editar después desde la app, esto es solo el punto de partida)
INSERT INTO campamentos (nombre, orden) VALUES
    ('ROJO 1', 1),
    ('ROJO 2', 2),
    ('ROJO 3', 3),
    ('ROJO 4', 4),
    ('C.SOCIAL 1', 5),
    ('C.SOCIAL 2', 6),
    ('AMARILLO 6', 7),
    ('AMARILLO 7', 8),
    ('AMARILLO 9', 9),
    ('VERDE 11', 10),
    ('VERDE 12', 11),
    ('VERDE 13', 12),
    ('VERDE 14', 13),
    ('AZUL 15', 14),
    ('AZUL 16', 15)
ON CONFLICT (nombre) DO NOTHING;

-- Cabecera del reporte diario (un registro por día/responsable)
CREATE TABLE IF NOT EXISTS reporte_campamentos_cabecera (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    responsable VARCHAR(150),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    usuario_creacion VARCHAR(100)
);

-- Detalle: una fila por campamento dentro de un reporte
CREATE TABLE IF NOT EXISTS reporte_campamentos_detalle (
    id SERIAL PRIMARY KEY,
    reporte_id INT NOT NULL REFERENCES reporte_campamentos_cabecera(id) ON DELETE CASCADE,
    campamento_id INT NOT NULL REFERENCES campamentos(id),
    federacion VARCHAR(150),
    central VARCHAR(150),
    sindicato VARCHAR(150),
    erradicado NUMERIC(10,4),      -- Hectáreas de coca erradicada (E)
    total_erradicado NUMERIC(10,4), -- Espejo editable de "erradicado" (formato original lo repite)
    mensura NUMERIC(10,4),          -- Hectáreas de coca legal registrada (M, mensura, 1 Cato por persona)
    total_mensura NUMERIC(10,4),    -- Espejo editable de "mensura"
    alm INT,                       -- Cantidad de almácigos de coca
    errad INT,                     -- Número de erradicadores (militares/soldados) trabajando ese día
    lotes INT,                     -- Cantidad de lotes trabajados ese día
    parcelas INT,                  -- Cantidad de parcelas trabajadas ese día
    encargado_camp VARCHAR(150),
    observaciones VARCHAR(500)
);

-- ============================================================
-- MIGRACIÓN: si ya corriste este script antes (con las columnas
-- viejas total_red/total_men), este bloque las renombra sin perder
-- los datos ya guardados. Si es la primera vez que corrés el script,
-- estas líneas no hacen nada (no existen esas columnas todavía).
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='reporte_campamentos_detalle' AND column_name='total_red') THEN
        ALTER TABLE reporte_campamentos_detalle RENAME COLUMN total_red TO erradicado;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='reporte_campamentos_detalle' AND column_name='total_men') THEN
        ALTER TABLE reporte_campamentos_detalle RENAME COLUMN total_men TO mensura;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='reporte_campamentos_detalle' AND column_name='total_erradicado') THEN
        ALTER TABLE reporte_campamentos_detalle ADD COLUMN total_erradicado NUMERIC(10,4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='reporte_campamentos_detalle' AND column_name='total_mensura') THEN
        ALTER TABLE reporte_campamentos_detalle ADD COLUMN total_mensura NUMERIC(10,4);
    END IF;
END $$;

-- Otorgar permisos al usuario de la app sobre las tablas y secuencias
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO reportes_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO reportes_app;

-- ============================================================
-- VISTAS DERIVADAS: RACIONALIZACIÓN Y ERRADICACIÓN
--
-- Estas vistas NO son captura manual nueva — se calculan a partir
-- de los mismos datos ya capturados en reporte_campamentos_detalle
-- (campo Federación de cada fila de Campamentos), agrupando y
-- sumando por federación, y clasificando cada federación como
-- "Área Legal" o "Parque/Zona No Autorizada" según esta tabla.
--
-- Solo se necesita mantener esta lista de clasificación — el resto
-- (sumas, acumulados anuales) se calcula en tiempo real.
-- ============================================================

CREATE TABLE IF NOT EXISTS clasificacion_federaciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,  -- debe coincidir EXACTO con el texto tipeado en Federación
    bloque VARCHAR(30) NOT NULL,         -- 'parque_cbba_lp_beni' | 'parque_santa_cruz'
                                          -- (lo que NO esté en esta tabla se asume 'area_legal' por defecto)
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO clasificacion_federaciones (nombre, bloque, orden) VALUES
    ('P.N.C.', 'parque_cbba_lp_beni', 1),
    ('P.I.S.(COCHABAMBA)', 'parque_cbba_lp_beni', 2),
    ('P.I.S.(BENI)', 'parque_cbba_lp_beni', 3),
    ('T.C.O.', 'parque_cbba_lp_beni', 4),
    ('SEQUERRANCHO(AYOPAYA)', 'parque_cbba_lp_beni', 5),
    ('SEQUERRANCHO(INQUISIVI)', 'parque_cbba_lp_beni', 6),
    ('AYOPAYA(ULUPICANI)', 'parque_cbba_lp_beni', 7),
    ('CHAPARE-VALLECITO CARMEN PAMPA', 'parque_cbba_lp_beni', 8),
    ('F.S.U.T.C.C.', 'parque_cbba_lp_beni', 9),
    ('T.I.P.N.I.S.', 'parque_cbba_lp_beni', 10),

    ('P.N.AMBORO', 'parque_santa_cruz', 1),
    ('RESERVA EL CHORE', 'parque_santa_cruz', 2),
    ('YAPACANI', 'parque_santa_cruz', 3)
ON CONFLICT (nombre) DO NOTHING;

-- Si la primera vez se cargó VANDIOLA en vez de C.R.Y.V.T. (nombre real
-- confirmado para el bloque Área Legal en la vista por Departamento),
-- la app sigue funcionando igual porque area_legal es "lo que no esté
-- en clasificacion_federaciones" — no requiere fila aquí.

-- ============================================================
-- VISTA "POR ZONA / DEPARTAMENTO" (Zona Autorizada/No Autorizada +
-- tabla de Departamento con #Polígonos). Es una segunda forma de
-- agrupar los mismos datos de reporte_campamentos_detalle — separada
-- de "Área Legal y Parques" porque la institución usa ambas vistas.
--
-- Solo necesita saber, por federación, en qué DEPARTAMENTO está esa
-- zona (una federación/parque puede repetirse en más de un
-- departamento, ej. T.I.P.N.I.S. en Cochabamba y en Beni).
-- ============================================================

CREATE TABLE IF NOT EXISTS clasificacion_zona_departamento (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,          -- debe coincidir EXACTO con el texto tipeado en Federación
    zona VARCHAR(40) NOT NULL,            -- 'autorizada' | 'no_autorizada'
    departamento VARCHAR(30) NOT NULL,    -- 'COCHABAMBA' | 'BENI' | 'SANTA CRUZ' | 'LA PAZ'
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(nombre, departamento)          -- permite el mismo nombre en 2 departamentos distintos
);

INSERT INTO clasificacion_zona_departamento (nombre, zona, departamento, orden) VALUES
    -- Zona Autorizada - Cochabamba (las 7 de Área Legal)
    ('F.U.C.U.', 'autorizada', 'COCHABAMBA', 1),
    ('F.E.C.CH.', 'autorizada', 'COCHABAMBA', 2),
    ('F.E.T.C.T.C.', 'autorizada', 'COCHABAMBA', 3),
    ('F.S.C.C.T.', 'autorizada', 'COCHABAMBA', 4),
    ('F.E.Z.T.Y.CH.', 'autorizada', 'COCHABAMBA', 5),
    ('F.S.A.I.M.B.B.', 'autorizada', 'COCHABAMBA', 6),
    ('C.R.Y.V.T.', 'autorizada', 'COCHABAMBA', 7),

    -- Zona No Autorizada - Cochabamba
    ('P.N.C.', 'no_autorizada', 'COCHABAMBA', 1),
    ('T.I.P.N.I.S.', 'no_autorizada', 'COCHABAMBA', 2),
    ('T.C.O.', 'no_autorizada', 'COCHABAMBA', 3),
    ('F.S.U.T.C.C.', 'no_autorizada', 'COCHABAMBA', 4),

    -- Zona No Autorizada - Beni
    ('T.I.P.N.I.S.', 'no_autorizada', 'BENI', 1),

    -- Zona No Autorizada - Santa Cruz
    ('P.N.AMBORO', 'no_autorizada', 'SANTA CRUZ', 1),
    ('RESERVA EL CHORE', 'no_autorizada', 'SANTA CRUZ', 2),
    ('YAPACANI', 'no_autorizada', 'SANTA CRUZ', 3)
ON CONFLICT (nombre, departamento) DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO reportes_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO reportes_app;

-- Confirmación
SELECT 'Tablas creadas correctamente.' AS resultado;

-- ============================================================
-- NOTA: si este script ya se corrió más de una vez ANTES de que
-- existiera la restricción UNIQUE (versiones previas), pueden haber
-- quedado campamentos duplicados. Para limpiarlos, correr UNA VEZ:
--
--   DELETE FROM campamentos a USING campamentos b
--   WHERE a.id > b.id AND a.nombre = b.nombre;
--
-- y luego volver a correr este script completo para que la
-- restricción UNIQUE se agregue sin error.
-- ============================================================

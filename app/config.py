import os

# ============================================================
# CONFIGURACIÓN DE CONEXIÓN A POSTGRESQL
# Base de datos propia y separada de BDUDESTRO (SQL Server).
# Por defecto asume que PostgreSQL corre en el mismo servidor
# Linux que la app — ajustar DB_HOST si está en otra máquina.
# ============================================================

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "reporte_campamentos")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "10fabrizioA@")

CONNECTION_PARAMS = {
    "host": DB_HOST,
    "port": DB_PORT,
    "dbname": DB_NAME,
    "user": DB_USER,
    "password": DB_PASSWORD,
}

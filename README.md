# Reporte Diario de Campamentos — UDESTRO

Reemplazo del sistema web perdido (`sisreporte`/`Reporte.asp`). Permite
capturar el reporte diario de campamentos desde cualquier PC de la red,
guardarlo en su propia base de datos, e imprimirlo o reimprimirlo cuando
se necesite.

Esta app usa **PostgreSQL**, completamente separado de `BDUDESTRO`
(SQL Server) — no depende ni afecta en nada al servidor de producción.

## 1. Instalar PostgreSQL en el servidor Linux nuevo

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## 2. Crear la base de datos y las tablas

Editar primero la contraseña en `setup_database.sql` (buscar
`CAMBIAR_ESTA_CONTRASEÑA` y reemplazarla por una real), y después:

```bash
sudo -u postgres psql -f setup_database.sql
```

Si el script falla al intentar crear las tablas porque no cambió de
base automáticamente, conectarse a mano y correr la segunda mitad:

```bash
sudo -u postgres psql -d reporte_campamentos -f setup_database.sql
```

(Ejecutarlo dos veces no causa problema — los `CREATE TABLE IF NOT
EXISTS` y el `ON CONFLICT DO NOTHING` lo hacen seguro de repetir.)

## 3. Instalar la aplicación

```bash
# Dependencias del sistema
sudo apt install -y python3 python3-venv python3-pip libpq-dev

# Copiar el proyecto al servidor (ajustar la ruta de origen)
sudo mkdir -p /opt/reporte-campamentos
sudo cp -r ./* /opt/reporte-campamentos/
cd /opt/reporte-campamentos

# Entorno virtual y dependencias Python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

## 4. Configurar la conexión a PostgreSQL

Editar las variables en `reporte-campamentos.service` con la misma
contraseña que usaste en el paso 2:

```
Environment="DB_HOST=localhost"
Environment="DB_PORT=5432"
Environment="DB_NAME=reporte_campamentos"
Environment="DB_USER=reportes_app"
Environment="DB_PASSWORD=CAMBIAR_ESTA_CONTRASEÑA"
```

## 5. Instalar como servicio (arranca solo con el servidor)

```bash
sudo cp reporte-campamentos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable reporte-campamentos
sudo systemctl start reporte-campamentos
```

Verificar que esté corriendo:

```bash
sudo systemctl status reporte-campamentos
```

Ver logs en vivo si algo falla:

```bash
sudo journalctl -u reporte-campamentos -f
```

## 6. Probar manualmente (sin systemd, para depurar)

```bash
cd /opt/reporte-campamentos
source venv/bin/activate
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=reporte_campamentos
export DB_USER=reportes_app
export DB_PASSWORD=CAMBIAR_ESTA_CONTRASEÑA
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 7. Acceder desde cualquier PC de la red

```
http://IP_DEL_SERVIDOR_LINUX:8000
```

(reemplazar `IP_DEL_SERVIDOR_LINUX` por la IP real que le asignes a este
nuevo servidor Linux en la red de la institución)

## 8. Abrir el puerto en el firewall (si usa ufw)

```bash
sudo ufw allow 8000/tcp
```

## 9. Permitir conexiones locales en PostgreSQL (si hace falta)

Si al iniciar el servicio aparece un error de autenticación, revisar
`pg_hba.conf` (normalmente en `/etc/postgresql/<version>/main/pg_hba.conf`)
y asegurarse de que exista una línea para conexiones locales con el
método `md5` o `scram-sha-256`, por ejemplo:

```
host    reporte_campamentos    reportes_app    127.0.0.1/32    scram-sha-256
```

Después de editar, reiniciar PostgreSQL:

```bash
sudo systemctl restart postgresql
```

## Notas

- La lista de campamentos es editable vía API (`/api/campamentos`) —
  no hace falta tocar código si cambian los nombres o se agregan/quitan
  campamentos. Una pantalla de administración simple para esto puede
  agregarse después si se necesita usar seguido.
- Los reportes quedan guardados con fecha, así que se puede reimprimir
  cualquier día anterior desde la sección "Reportes recientes".
- Si PostgreSQL no está disponible, la app muestra un aviso claro en
  lugar de fallar en silencio.
- Esta base es independiente de `BDUDESTRO`: un problema en el servidor
  de SQL Server no afecta a este sistema, y viceversa.

#!/usr/bin/env bash
# Quick-start deploy script for the "campamentos" docker-compose stack.
# Run this on the Rocky Linux server, in the same directory as docker-compose.yml,
# AFTER manually uploading docker-compose.yml, .env, and nginx/nginx.conf.
set -euo pipefail

COMPOSE="docker compose"
OLD_CONTAINER="campamentos"

if [[ -d .git ]]; then
    echo "==> -1. Pulling latest code from git"
    git pull
    echo "    OK"
fi

echo "==> 0. Normalizing line endings (Windows CRLF breaks .env parsing)"
for f in .env docker-compose.yml nginx/nginx.conf setup_database.sql; do
    if [[ -f "$f" ]] && grep -qU $'\r' "$f" 2>/dev/null; then
        sed -i 's/\r$//' "$f"
        echo "    Fixed CRLF line endings in $f"
    fi
done

echo "==> 1. Validating docker-compose.yml"
$COMPOSE config > /dev/null
echo "    OK"

echo "==> 2. Checking nginx/nginx.conf exists"
if [[ ! -f nginx/nginx.conf ]]; then
    echo "    ERROR: nginx/nginx.conf not found. Upload it before running this script."
    exit 1
fi
echo "    OK"

echo "==> 2b. Checking setup_database.sql exists"
if [[ ! -f setup_database.sql ]]; then
    echo "    ERROR: setup_database.sql not found. Upload it before running this script."
    exit 1
fi
echo "    OK"

# Postgres only runs files in /docker-entrypoint-initdb.d/ the FIRST time the
# data volume is initialized (i.e. when it's empty). If postgres_data already
# exists with data, setup_database.sql will be silently skipped.
if docker volume inspect "$(basename "$PWD")_postgres_data" >/dev/null 2>&1; then
    echo "    WARNING: volume '$(basename "$PWD")_postgres_data' already exists."
    echo "    setup_database.sql only runs on first init of an EMPTY volume — it will NOT run on an existing volume."
    read -rp "    Remove existing volume to force a fresh restore? [y/N] " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
        $COMPOSE down -v
        echo "    Volume removed. setup_database.sql will run on next 'up'."
    fi
fi

echo "==> 3. Stopping/removing loose container '$OLD_CONTAINER' if present"
if docker ps -a --format '{{.Names}}' | grep -qx "$OLD_CONTAINER"; then
    docker stop "$OLD_CONTAINER" || true
    docker rm "$OLD_CONTAINER" || true
    echo "    Removed."
else
    echo "    Not running, nothing to do."
fi

echo "==> 4. Pulling base images (postgres, nginx) and building app image from local Dockerfile"
$COMPOSE pull postgres nginx
$COMPOSE build app

echo "==> 5. Starting stack (docker compose up -d)"
$COMPOSE up -d

echo "==> 6. Waiting a few seconds for services to settle"
sleep 5

# setup_database.sql only auto-runs via initdb.d on a brand-new empty volume.
# On every redeploy (existing data), apply it again manually so schema
# changes (new columns, new catalog rows, etc.) land without touching data.
# The script is written to be idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
echo "==> 6b. Applying setup_database.sql migration against the running database"
set -a
source .env
set +a
if docker exec -i postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < setup_database.sql; then
    echo "    Migration applied."
else
    echo "    WARNING: migration failed. Check the output above."
fi

echo "==> 7. Service status"
$COMPOSE ps

echo "==> 8. Last 50 lines of app logs (check for DB connection errors)"
$COMPOSE logs --tail=50 app

echo "==> 9. Testing HTTP entrypoint via nginx (port 80)"
if curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:80; then
    echo "    Reachable."
else
    echo "    WARNING: curl failed. Checking nginx logs..."
    $COMPOSE logs --tail=50 nginx
fi

echo "==> Done. If anything above shows errors, run:"
echo "    docker compose logs app"
echo "    docker compose logs postgres"
echo "    docker compose logs nginx"
echo "before applying any fix."

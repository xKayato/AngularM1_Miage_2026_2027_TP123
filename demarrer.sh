#!/bin/sh
# Lance MakerShare avec Docker (macOS / Linux). Docker doit être démarré.
set -e
cd "$(dirname "$0")"
PORT="${APP_PORT:-8080}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas. Lancez Docker puis relancez ce script." >&2
  exit 1
fi

echo "Construction et démarrage des conteneurs (le premier lancement prend quelques minutes)..."
docker compose up --build -d

echo
echo "MakerShare est disponible sur http://localhost:$PORT"
echo "Pour arrêter : docker compose down"
if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
fi

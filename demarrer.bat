@echo off
REM Lance Guitar Practice Cloud avec Docker (double-clic sous Windows). Docker Desktop doit etre demarre.
cd /d "%~dp0"
if "%APP_PORT%"=="" set APP_PORT=8081

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop ne repond pas. Lancez-le puis relancez ce script.
  pause
  exit /b 1
)

echo Construction et demarrage des conteneurs (le premier lancement prend quelques minutes)...
docker compose up --build -d
if errorlevel 1 (
  echo Le demarrage a echoue. Consultez : docker compose logs
  pause
  exit /b 1
)

echo.
echo Guitar Practice Cloud est disponible sur http://localhost:%APP_PORT%
echo Pour arreter : docker compose down
start "" http://localhost:%APP_PORT%

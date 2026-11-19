"""Construit un paquet Docker « prêt à lancer » pour un tag du dépôt.

Usage (depuis la racine du dépôt, Docker démarré) :
    python tools/package_release.py v3.1.0

Résultat dans release-assets/ :
    <app>-<tag>-docker.zip   à joindre à la Release GitHub du tag.

Le zip contient les images Docker déjà construites (API + site), un docker-compose.yml
qui les utilise sans rien recompiler, des lanceurs pour Windows / macOS / Linux et un
LISEZMOI. L'utilisateur n'a besoin que de Docker Desktop : ni Node.js, ni sources.
"""

from __future__ import annotations

import argparse
import gzip
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DEMO_ACCOUNTS = {
    "guitar-practice-cloud": (
        "Guitar Practice Cloud (TP1 à TP3)",
        "Compte de démonstration créé automatiquement : demo@example.com / Demo1234!",
    ),
    "makershare": (
        "MakerShare (TP4 à TP6)",
        "Jeu de démonstration chargé au premier lancement (10 créateurs, 100 posts).\n"
        "Comptes : demo.alice.lego@makershare.local, demo.bastien.paper@makershare.local, …\n"
        "Mot de passe : MakerShare2026! (modifiable via DEMO_PASSWORD dans un fichier .env)",
    ),
}


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kwargs)


def crlf(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\n", "\r\n")


def build_bundle(tag: str, out_dir: Path) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="release-"))
    src = tmp / "src"
    run(["git", "-C", str(ROOT), "worktree", "add", "--detach", str(src), tag])
    try:
        compose_src = (src / "docker-compose.yml").read_text(encoding="utf-8")
        name_match = re.search(r"^name:\s*(\S+)", compose_src, re.M)
        port_match = re.search(r"APP_PORT:-(\d+)", compose_src)
        if not name_match or not port_match:
            sys.exit(f"docker-compose.yml du tag {tag} sans 'name:' ou sans APP_PORT par défaut")
        app, port = name_match.group(1), port_match.group(1)
        title, demo = DEMO_ACCOUNTS.get(app, (app, ""))

        api_image, web_image = f"{app}-api:{tag}", f"{app}-web:{tag}"
        run(["docker", "build", "-t", api_image, str(src / "backend")])
        run(["docker", "build", "-t", web_image, str(src / "frontend-starter")])

        bundle = tmp / f"{app}-{tag}"
        bundle.mkdir()

        # 1. Images prêtes à charger (docker load lit directement le .tar.gz)
        tar_path = tmp / "images.tar"
        run(["docker", "save", "-o", str(tar_path), api_image, web_image])
        with open(tar_path, "rb") as raw, gzip.open(bundle / "images.tar.gz", "wb", compresslevel=6) as gz:
            shutil.copyfileobj(raw, gz, length=1024 * 1024)
        tar_path.unlink()

        # 2. Compose qui utilise les images fournies au lieu de les reconstruire
        compose = compose_src
        compose = re.sub(r"^(\s*)build: \./backend\s*$", rf"\1image: {api_image}\n\1pull_policy: never", compose, flags=re.M)
        compose = re.sub(r"^(\s*)build: \./frontend-starter\s*$", rf"\1image: {web_image}\n\1pull_policy: never", compose, flags=re.M)
        compose = re.sub(r"docker compose up --build", "docker compose up -d", compose)
        if "build:" in compose:
            sys.exit("Une section build: subsiste dans le compose généré")
        (bundle / "docker-compose.yml").write_text(compose, encoding="utf-8", newline="\n")

        # 3. Lanceurs
        (bundle / "demarrer.bat").write_bytes(crlf(f"""@echo off
REM {title} - lancement en un clic (Docker Desktop doit etre demarre)
cd /d "%~dp0"
if "%APP_PORT%"=="" set APP_PORT={port}

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop ne repond pas. Lancez-le puis relancez ce script.
  pause
  exit /b 1
)

docker image inspect {api_image} >nul 2>&1 && docker image inspect {web_image} >nul 2>&1
if errorlevel 1 (
  echo Chargement des images Docker fournies, une seule fois...
  docker load -i images.tar.gz
  if errorlevel 1 ( pause & exit /b 1 )
)

docker compose up -d
if errorlevel 1 (
  echo Le demarrage a echoue. Consultez : docker compose logs
  pause
  exit /b 1
)

echo.
echo Application disponible sur http://localhost:%APP_PORT%
echo Pour arreter : double-cliquer sur arreter.bat
start "" http://localhost:%APP_PORT%
""").encode("utf-8"))

        (bundle / "arreter.bat").write_bytes(crlf("""@echo off
cd /d "%~dp0"
docker compose down
echo Application arretee. Les donnees sont conservees (docker compose down -v pour tout effacer).
pause
""").encode("utf-8"))

        sh = f"""#!/bin/sh
# {title} - lancement en un clic (Docker doit être démarré)
set -e
cd "$(dirname "$0")"
PORT="${{APP_PORT:-{port}}}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas. Lancez Docker puis relancez ce script." >&2
  exit 1
fi

if ! docker image inspect {api_image} >/dev/null 2>&1 || ! docker image inspect {web_image} >/dev/null 2>&1; then
  echo "Chargement des images Docker fournies, une seule fois..."
  docker load -i images.tar.gz
fi

docker compose up -d
echo
echo "Application disponible sur http://localhost:$PORT"
echo "Pour arrêter : docker compose down"
if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
fi
"""
        (bundle / "demarrer.sh").write_text(sh, encoding="utf-8", newline="\n")

        (bundle / "LISEZMOI.txt").write_bytes(crlf(f"""{title} - version {tag} prête à lancer
{'=' * 60}

Prérequis : Docker Desktop (https://www.docker.com/products/docker-desktop/) démarré.
Une connexion internet est nécessaire au premier lancement pour télécharger l'image MongoDB.

Lancer
  Windows        : double-cliquer sur demarrer.bat
  macOS / Linux  : ./demarrer.sh   (ou : sh demarrer.sh)
  Puis ouvrir    : http://localhost:{port}

{demo}

Arrêter          : arreter.bat (Windows) ou docker compose down
Tout effacer     : docker compose down -v
Changer de port  : définir APP_PORT (ex. APP_PORT=9000) avant de lancer

Contenu
  images.tar.gz       images Docker de l'API et du site (déjà construites)
  docker-compose.yml  MongoDB + API + site (nginx), données conservées dans des volumes
  demarrer.* / arreter.bat

Images construites pour processeurs x86-64 ; sur Mac Apple Silicon, Docker Desktop
les exécute automatiquement en émulation.
""").encode("utf-8"))

        # 4. Archive finale
        out_dir.mkdir(parents=True, exist_ok=True)
        zip_path = out_dir / f"{app}-{tag}-docker.zip"
        zip_path.unlink(missing_ok=True)
        with zipfile.ZipFile(zip_path, "w") as zf:
            for f in sorted(bundle.iterdir()):
                arc = f"{bundle.name}/{f.name}"
                info = zipfile.ZipInfo.from_file(f, arc)
                if f.suffix == ".sh":
                    info.external_attr = 0o100755 << 16
                method = zipfile.ZIP_STORED if f.name.endswith(".gz") else zipfile.ZIP_DEFLATED
                info.compress_type = method
                with open(f, "rb") as fh:
                    zf.writestr(info, fh.read())
        return zip_path
    finally:
        subprocess.run(["git", "-C", str(ROOT), "worktree", "remove", "--force", str(src)], check=False)
        # Sous OneDrive, git peut ne pas réussir à supprimer ses métadonnées : on nettoie à la main.
        shutil.rmtree(ROOT / ".git" / "worktrees" / src.name, ignore_errors=True)
        subprocess.run(["git", "-C", str(ROOT), "worktree", "prune"], check=False)
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tag", help="tag Git à empaqueter (ex. v3.1.0)")
    parser.add_argument("--out", default=str(ROOT / "release-assets"), help="dossier de sortie")
    args = parser.parse_args()
    zip_path = build_bundle(args.tag, Path(args.out))
    size_mb = zip_path.stat().st_size / 1024 / 1024
    print(f"\nPaquet prêt : {zip_path} ({size_mb:.0f} Mo)")


if __name__ == "__main__":
    main()

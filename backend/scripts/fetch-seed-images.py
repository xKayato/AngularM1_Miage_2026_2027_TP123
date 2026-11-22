"""Télécharge des photos libres de droits (Wikimedia Commons) pour le jeu de démonstration.

Usage (depuis backend/) :
    python scripts/fetch-seed-images.py            # tout
    python scripts/fetch-seed-images.py --only covers:12,13 avatars:alice

Pour chaque post de démo (index 0 à 99, ordre de buildDemoPosts) et chaque compte de démo, on
cherche une photo correspondant au sujet, en ne gardant que les licences libres réutilisables
(domaine public, CC0, CC BY, CC BY-SA). Les images sont réduites par Wikimedia (960 px pour
les couvertures, 256 px pour les avatars) et enregistrées dans scripts/seed-assets/ avec un
fichier credits.json (auteur, licence, page source) affiché dans CREDITS.md.

Ce script n'est lancé qu'une fois par le mainteneur : les images sont ensuite versionnées,
le seed n'a donc jamais besoin d'internet.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "seed-assets"
API = "https://commons.wikimedia.org/w/api.php"
UA = "MakerShareSeedBuilder/1.0 (student demo dataset; https://commons.wikimedia.org)"

ALLOWED_LICENSE = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? [0-9.]+)", re.I)
REJECT_TITLE = re.compile(
    r"logo|map|diagram|chart|flag|coat of arms|icon|screenshot|svg|stamp|poster|drawing|patent|plan of"
    r"|ai-generated|algorithmically|troops|military|soldier|war |weapon|cemetery|grave|church|temple|mosque|wall"
    r"|MKL|lexikon|engraving of|portrait of|cosplayer|contest|man |woman |girl|boy|people|crowd",
    re.I,
)

# Index du post -> requêtes Commons (la première qui donne une image valide gagne)
COVERS: dict[int, list[str]] = {
    0: ["lego millennium falcon", "lego star wars ship"],
    1: ["lego technic crane", "lego technic"],
    2: ["lego vintage car", "lego car"],
    3: ["lego modular building", "lego house"],
    4: ["lego guitar", "electric guitar body"],
    5: ["lego castle set", "lego knights castle", "toy castle"],
    6: ["lego rover", "mars rover model"],
    7: ["lego minifigure", "lego minifigures"],
    8: ["lego submarine", "yellow submarine model"],
    9: ["lego space diorama", "lego space"],
    10: ["stormtrooper helmet replica", "stormtrooper costume"],
    11: ["millennium falcon model"],
    12: ["paper deer head", "geometric deer head", "deer head sculpture"],
    13: ["paper dragon", "chinese paper dragon"],
    14: ["File:A Pokémon figure outside the Geek Retreat in Galashiels - geograph.org.uk - 7138893.jpg", "pikachu toy", "pikachu plush", "pikachu"],
    15: ["eiffel tower model", "eiffel tower miniature"],
    16: ["oni mask"],
    17: ["dassault rafale model", "dassault rafale"],
    18: ["cardboard castle model", "paper model building", "cardboard model house"],
    19: ["papercraft mask", "paper mask"],
    20: ["origami"],
    21: ["senbazuru", "thousand origami cranes", "paper crane washi"],
    22: ["origami lotus"],
    23: ["origami dragon"],
    24: ["miura fold", "origami tessellation"],
    25: ["masu box origami", "origami box"],
    26: ["jumping frog origami", "green origami frog", "origami animal"],
    27: ["origami elephant"],
    28: ["kawasaki rose origami", "origami rose"],
    29: ["origami pegasus", "origami horse"],
    30: ["guitar pedalboard"],
    31: ["cigar box guitar"],
    32: ["cajon drum", "cajon"],
    33: ["eurorack modular synthesizer", "modular synthesizer"],
    34: ["kalimba"],
    35: ["tube guitar amplifier", "vacuum tube amplifier"],
    36: ["ribbon microphone"],
    37: ["fretless bass guitar", "bass guitar"],
    38: ["fuzz pedal", "guitar effects pedal"],
    39: ["soprano ukulele", "ukulele"],
    40: ["robot arm desktop", "servo robot arm", "robot arm"],
    41: ["3d printed phone stand", "smartphone stand"],
    42: ["3d printed planetary gear", "planetary gear"],
    43: ["mini-itx computer case", "computer case"],
    44: ["voronoi", "3d printed lampshade", "lamp shade"],
    45: ["racing quadcopter", "quadcopter drone"],
    46: ["pencil cup", "desk tidy", "office desk organizer"],
    47: ["clock gears", "wooden clock mechanism", "pendulum clock mechanism"],
    48: ["macro keypad", "mechanical keyboard"],
    49: ["3d printed prosthetic hand", "prosthetic hand"],
    50: ["pen plotter"],
    51: ["automatic pet feeder", "cat food bowl"],
    52: ["weather station", "e-paper display"],
    53: ["seedlings tray greenhouse", "greenhouse plants", "seedlings"],
    54: ["infinity mirror"],
    55: ["rubik's cube robot", "rubik's cube"],
    56: ["thermostat"],
    57: ["photogrammetry turntable", "3d scanner"],
    58: ["laser engraving wood", "wooden keychain"],
    59: ["laboratory power supply", "bench power supply"],
    60: ["woodworking workbench"],
    61: ["end grain cutting board", "wooden cutting board"],
    62: ["japanese puzzle box", "himitsu-bako"],
    63: ["File:Anglepoise lamp, model 1208.jpg", "wooden lamp", "scandinavian lamp", "desk lamp"],
    64: ["lego minifigures display", "lego minifigures"],
    65: ["wood turning lathe", "woodturning"],
    66: ["headphone stand", "headphones"],
    67: ["marquetry"],
    68: ["wooden chess set", "chess pieces wood"],
    69: ["epoxy resin table", "river table", "live edge table"],
    70: ["mandalorian cosplay"],
    71: ["File:Pennaceous feathers by Garrulus glandarius.jpg", "butterfly wings costume", "fairy wings", "costume wings"],
    72: ["futuristic helmet prop", "sci-fi helmet", "helmet prop"],
    73: ["File:Metallic magic staff in the shape of a sun in Tel Aviv , April 2024 01.jpg", "magic wand prop", "wizard staff", "fantasy staff"],
    74: ["cosplay armor", "armour pauldron"],
    75: ["wire crown", "wire tiara", "copper wire jewelry"],
    76: ["venetian mask shop", "venetian masks"],
    77: ["infinity gauntlet"],
    78: ["medieval leather boots", "leather boots"],
    79: ["tricorne hat", "pirate hat"],
    80: ["ukulele"],
    81: ["acoustic foam", "acoustic panels"],
    82: ["File:4 Black and Blue Sound Diffusor Panels.jpg", "studio diffuser wood", "wooden diffuser panel", "recording studio wall"],
    83: ["trumpet mute"],
    84: ["guitar bone nut", "guitar bridge saddle"],
    85: ["guitar stand"],
    86: ["midi keyboard controller", "midi keyboard"],
    87: ["guitar case", "violin case"],
    88: ["roland tr-808", "drum machine roland", "roland tr-909"],
    89: ["electric violin", "silent violin"],
    90: ["porcelain vase", "geometric vase"],
    91: ["handmade mug", "ceramic cup handmade", "pottery mug"],
    92: ["concrete planter"],
    93: ["ceramic table lamp", "ceramic lamp base"],
    94: ["handmade ceramic plates", "stoneware plates"],
    95: ["essential oil diffuser", "aroma diffuser", "oil burner ceramic"],
    96: ["porcelain flower", "ceramic flower"],
    97: ["modern wall clock", "wall clock"],
    98: ["japanese teapot", "chawan tea bowl", "japanese tea"],
    99: ["backflow incense burner", "incense burner"],
}

# Avatars : pas de visages de vraies personnes (on ne colle pas un nom inventé sur quelqu'un
# d'identifiable), mais ce que les vrais utilisateurs mettent souvent : leur atelier, leurs
# mains au travail, leur animal, un paysage…
AVATARS: dict[str, list[str]] = {
    "alice": ["lego bricks", "lego bricks pile"],
    "bastien": ["paper craft scissors", "papercraft"],
    "camille": ["origami paper colorful", "origami paper"],
    "damien": ["luthier workshop", "luthier"],
    "elena": ["File:Prusa i3 - RepRap 3D printer printing.jpg", "3d printer printing", "3d printer"],
    "felix": ["soldering iron circuit", "soldering"],
    "gabriel": ["woodworking chisel", "woodworking"],
    "helene": ["sewing machine", "sewing"],
    "ismail": ["acoustic guitar headstock", "acoustic guitar"],
    "julie": ["File:Hands carrying a just sculpted clay bowl.jpg", "pottery wheel hands", "pottery wheel"],
    # Membres de la communauté (pas de projets publiés)
    "lea": ["tabby cat portrait", "cat"],
    "marc": ["mountain lake landscape", "mountain landscape"],
    "nina": ["latte art coffee", "cup of coffee"],
    "omar": ["bicycle parked", "vintage bicycle"],
    "pauline": ["sunflower", "sunflower field"],
    # Compte de modération de la démo
    "admin": ["lighthouse", "lighthouse coast"],
    "quentin": ["turntable vinyl", "vinyl records"],
}


def api_search(query: str, width: int) -> list[dict]:
    # Une requête « File:… » désigne un fichier précis choisi à la main après relecture
    if query.startswith("File:"):
        return api_file(query, width)
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6",
        "gsrlimit": "12",
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(width),
        "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|UsageTerms",
    }
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    pages = list(data.get("query", {}).get("pages", {}).values())
    pages.sort(key=lambda p: p.get("index", 999))
    return pages


def api_file(title: str, width: int) -> list[dict]:
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(width),
        "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|UsageTerms",
    }
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    pages = list(data.get("query", {}).get("pages", {}).values())
    for page in pages:
        page["pinned"] = True
    return pages


def clean_artist(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw or "")
    return html.unescape(text).strip() or "Auteur inconnu"


def pick(pages: list[dict], kind: str, used: set[str]) -> dict | None:
    for p in pages:
        title = p.get("title", "")
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        w, h = info.get("width", 0), info.get("height", 0)
        pinned = p.get("pinned", False)
        if title in used or (not pinned and REJECT_TITLE.search(title)):
            continue
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if not ALLOWED_LICENSE.match(lic.strip()):
            continue
        if pinned:
            pass
        elif kind == "cover" and (w < 900 or h < 500 or not (0.9 <= w / max(h, 1) <= 2.2)):
            continue
        if kind == "avatar" and (w < 300 or h < 300 or not (0.6 <= w / max(h, 1) <= 1.8)):
            continue
        return {
            "title": title,
            "thumb": info["thumburl"],
            "page": info.get("descriptionurl", ""),
            "license": lic,
            "licenseUrl": meta.get("LicenseUrl", {}).get("value", ""),
            "artist": clean_artist(meta.get("Artist", {}).get("value", "")),
            "mime": info["mime"],
        }
    return None


def download(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
    dest.write_bytes(data)
    return len(data)


def run(kind: str, items: dict, width: int, folder: Path, credits: dict, used: set[str]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for key, queries in items.items():
        choice = None
        for q in queries:
            choice = pick(api_search(q, width), kind, used)
            time.sleep(0.4)
            if choice:
                break
        if not choice:
            print(f"!! {kind} {key}: aucune image libre trouvée pour {queries}")
            continue
        ext = ".png" if choice["mime"] == "image/png" else ".jpg"
        name = f"{key:02d}{ext}" if isinstance(key, int) else f"{key}{ext}"
        for old in folder.glob(f"{name.rsplit('.', 1)[0]}.*"):
            old.unlink()
        size = download(choice["thumb"], folder / name)
        used.add(choice["title"])
        credits[f"{folder.name}/{name}"] = {k: choice[k] for k in ("title", "page", "artist", "license", "licenseUrl")}
        print(f"ok {kind} {key}: {choice['title'][5:70]} | {choice['license']} | {size // 1024} Ko")
        time.sleep(0.3)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="ex. covers:3,12 avatars:alice")
    args = parser.parse_args()

    covers, avatars = COVERS, AVATARS
    if args.only:
        covers, avatars = {}, {}
        for spec in args.only:
            kind, _, keys = spec.partition(":")
            for k in keys.split(","):
                if kind == "covers":
                    covers[int(k)] = COVERS[int(k)]
                elif kind == "avatars":
                    avatars[k] = AVATARS[k]

    credits_path = ASSETS / "credits.json"
    credits = json.loads(credits_path.read_text(encoding="utf-8")) if credits_path.exists() else {}
    used = {c["title"] for c in credits.values()}
    run("cover", covers, 960, ASSETS / "covers", credits, used)
    run("avatar", avatars, 256, ASSETS / "avatars", credits, used)
    credits = {k: v for k, v in credits.items() if (ASSETS / k).exists()}
    credits_path.write_text(json.dumps(dict(sorted(credits.items())), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(credits)} images créditées dans {credits_path}")


if __name__ == "__main__":
    main()

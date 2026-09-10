#!/usr/bin/env bash
# Собирает браузерный клиент в client/www: движок из образа, контент — ссылками.
# Каталог client/www целиком генерируемый, в git не попадает.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
www="${root}/client/www"

echo "== собираю движок под Emscripten"
docker build -f "${root}/client/Dockerfile" --target build \
    -t arena-app/client-build:dev "${root}/client"

echo "== достаю артефакты"
rm -rf "${www}"
mkdir -p "${www}"
cid="$(docker create arena-app/client-build:dev)"
docker cp "${cid}:/src/build/Release/." "${www}/" > /dev/null
docker rm "${cid}" > /dev/null

# Пустые каталоги из сборки мешают ссылкам на контент
rm -rf "${www}/baseq3" "${www}/missionpack" "${www}/ioquake3.html"

echo "== подкладываю контент и оболочку"
ln -sfn ../../game/content/osp "${www}/osp"
ln -sfn ../../game/maps "${www}/maps"
cp "${root}/client/shell/index.html" "${www}/index.html"
# Оболочка вынесена из index.html отдельным файлом: CSP не разрешает inline
cp "${root}/client/shell/shell.js"   "${www}/shell.js"

# Конфиги мода едут в браузер теми же файлами, что читает выделенный сервер:
# иначе локальная игра идёт на голых дефолтах OSP — с предметами по всей карте
# и самоуроном. Правила должны быть в одном месте, а не продублированы в клиенте.
mkdir -p "${www}/osp-cfg/cfg-modes" "${www}/osp-cfg/cfg-maps"
cp "${root}/game/osp/server.cfg"            "${www}/osp-cfg/server.cfg"
cp "${root}/game/osp/cfg-modes/modes.txt"   "${www}/osp-cfg/cfg-modes/modes.txt"
cp "${root}/game/osp/cfg-modes/arena.cfg"   "${www}/osp-cfg/cfg-modes/arena.cfg"
cp "${root}/game/osp/cfg-maps/camaps.txt"   "${www}/osp-cfg/cfg-maps/camaps.txt"
# Клавиши для браузера: ESC там занят, а без выбора команды в CA не играют
cp "${root}/client/shell/arena.cfg"         "${www}/osp-cfg/arena.cfg"
# arena.cfg последней строкой подключает secrets.cfg; в браузере rcon не нужен,
# но пустая заглушка избавляет от ошибки в консоли
echo "// В браузере rcon не нужен." > "${www}/osp-cfg/secrets.cfg"

# Отпечаток сертификата моста — только для разработки. Нет файла — клиент
# просто не станет передавать хеш, и это правильное поведение для боевого
# контура, где у моста обычный сертификат.
if [ -f "${root}/var/dev-cert/fingerprint.txt" ]; then
    cp "${root}/var/dev-cert/fingerprint.txt" "${www}/fingerprint.txt"
fi

# В конфиг движка добавляется раздел мода: без него osp не подгрузится
python3 - "${www}/ioquake3-config.json" "${root}/game/maps" "${www}" <<'PY'
import json, os, sys
p = sys.argv[1]
maps_dir = sys.argv[2]
www = sys.argv[3]
c = json.load(open(p))
# Паки baseq3 игрок приносит свои: это контент id Software, раздавать его мы
# не имеем права. Помечаем их, чтобы клиент спросил папку игры, а не качал.
for f in c.get("baseq3", {}).get("files", []):
    f["own"] = True

c["osp"] = {"files": [{"src": f"osp/{n}", "dst": "/osp"} for n in (
    "zz-osp-pak0.pk3", "zz-osp-pak1.pk3", "zz-osp-pak2.pk3",
    "zz-osp-pak3.pk3", "zz-osp-server3a.pk3")] + [
    {"src": "osp-cfg/server.cfg", "dst": "/osp"},
    {"src": "osp-cfg/secrets.cfg", "dst": "/osp"},
    {"src": "osp-cfg/arena.cfg", "dst": "/osp"},
    {"src": "osp-cfg/cfg-modes/modes.txt", "dst": "/osp/cfg-modes"},
    {"src": "osp-cfg/cfg-modes/arena.cfg", "dst": "/osp/cfg-modes"},
    {"src": "osp-cfg/cfg-maps/camaps.txt", "dst": "/osp/cfg-maps"},
] + [
    # Свои карты. Кладутся в каталог мода, а не в baseq3: baseq3 — это чужой
    # контент из коробки, и мешать с ним своё не стоит
    {"src": f"maps/{n}", "dst": "/osp"}
    for n in sorted(os.listdir(maps_dir)) if n.endswith(".pk3")
]}
# Размеры кладём в конфиг: без них полосу загрузки пришлось бы взвешивать по
# числу файлов, а pak0 — это 87% всех байт, и полоса врала бы в разы.
for section in c.values():
    for f in section.get("files", []):
        path = os.path.join(www, f["src"])
        if not os.path.exists(path):
            # baseq3 больше не выкладывается наружу, но размер нужен полосе
            path = os.path.join(os.path.dirname(www), "..", "game", "content", f["src"])
        if os.path.exists(path):
            f["size"] = os.path.getsize(os.path.realpath(path))

json.dump(c, open(p, "w"), indent=4)
PY

echo "готово: ${www}"

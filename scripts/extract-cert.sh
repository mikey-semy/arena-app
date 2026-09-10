#!/usr/bin/env bash
# Достаёт сертификат домена из acme.json Traefik в PEM-файлы для моста.
#
# Зачем так: WebTransport требует настоящий сертификат, а он у Traefik внутри
# acme.json. Выпускать второй своим certbot нельзя — HTTP-проверка требует
# 80-й порт, который занят Traefik. Сертификат один на имя, порт ему безразличен,
# поэтому мосту подходит тот же самый.
#
# Читаем чужой файл, но только на чтение и только свой домен.
# Запускается на сервере после каждого перевыпуска — раз в два месяца.
set -euo pipefail

acme="${ARENA_ACME:-/root/setfork/traefik/dynamic/acme.json}"
domain="${ARENA_DOMAIN:-arena.sethub.org}"
out="${ARENA_CERT_OUT:-/srv/arena/var/cert}"

mkdir -p "${out}"
ARENA_ACME="${acme}" ARENA_DOMAIN="${domain}" ARENA_CERT_OUT="${out}" python3 - <<'PY'
import base64, json, os, pathlib

acme = json.loads(pathlib.Path(os.environ["ARENA_ACME"]).read_text())
domain = os.environ["ARENA_DOMAIN"]
out = pathlib.Path(os.environ["ARENA_CERT_OUT"])

for resolver in acme.values():
    for cert in resolver.get("Certificates") or []:
        names = [cert["domain"].get("main"), *(cert["domain"].get("sans") or [])]
        if domain not in names:
            continue
        (out / "cert.pem").write_bytes(base64.b64decode(cert["certificate"]))
        key = out / "key.pem"
        key.write_bytes(base64.b64decode(cert["key"]))
        key.chmod(0o600)
        # Владелец — пользователь контейнера моста (uid 1000), а не root:
        # мост работает не от root, и с правами 600 от root он ключ не прочтёт.
        # Права при этом не ослабляем — читает по-прежнему ровно один.
        os.chown(key, 1000, 1000)
        os.chown(out / "cert.pem", 1000, 1000)
        print(f"сертификат {domain} записан в {out}")
        raise SystemExit(0)

raise SystemExit(f"в acme.json нет сертификата для {domain}")
PY

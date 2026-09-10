#!/usr/bin/env bash
# Обновляет секреты в боевом .env значениями из локального.
#
# Значения не печатаются и не уходят в аргументы команды: аргументы видны
# любому в `ps`. Они передаются по stdin и подставляются на той стороне.
#
# Не трогает то, чего в списке нет: пароль базы и секрет сессий у боевого
# контура свои, и перезаписывать их локальными было бы ошибкой.
set -euo pipefail

host="${ARENA_DEPLOY_HOST:-netcup}"
dir="${ARENA_DEPLOY_DIR:-/srv/arena}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

keys=("${@:-}")
[ -z "${keys[0]}" ] && keys=(DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET)

for key in "${keys[@]}"; do
    grep -qE "^${key}=" "${root}/.env" || { echo "в локальном .env нет ${key}" >&2; exit 1; }
done

# shellcheck disable=SC2016
remote='
import os, sys, re, pathlib
path = pathlib.Path(os.environ["ARENA_ENV"])
text = path.read_text(encoding="utf-8")
changed = []
for line in sys.stdin.read().splitlines():
    if not line.strip():
        continue
    key, _, value = line.partition("=")
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if pattern.search(text):
        text = pattern.sub(f"{key}={value}", text)
    else:
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    changed.append(key)
path.write_text(text, encoding="utf-8")
path.chmod(0o600)
print("обновлено:", ", ".join(changed))
'

grep -E "^($(IFS='|'; echo "${keys[*]}"))=" "${root}/.env" \
  | ssh "${host}" "ARENA_ENV=${dir}/.env python3 -c '${remote}'"

# Переменные читают оба: сайт выписывает билеты, мост их проверяет.
# Перезапустить только один — значит развести их по разным ключам.
echo "== перезапускаю сайт и мост"
# shellcheck disable=SC2029
ssh "${host}" "cd ${dir} && docker compose up -d --force-recreate site bridge >/dev/null && echo перезапущены"

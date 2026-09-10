#!/usr/bin/env bash
# Выкатка сайта на боевой сервер.
#
# Образ собирается ЗДЕСЬ и уезжает готовым. Причина не в идеологии: на том хосте
# живут чужие проекты и почта, и сборка, съевшая там память, уронит не только нас.
#
# Передаём через docker save, а не через реестр: реестр — это ещё один сервис,
# ещё одни доступы и ещё одно место, где выкатка может встать. Пока проект один
# и сервер один, труба через ssh проще и честнее.
set -euo pipefail

host="${ARENA_DEPLOY_HOST:-netcup}"
dir="${ARENA_DEPLOY_DIR:-/srv/arena}"
image="arena-app/site:dev"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== собираю образ"
docker build -t "${image}" "${root}"

echo "== отправляю на ${host}"
docker save "${image}" | gzip -1 | ssh "${host}" 'gunzip | docker load'

echo "== обновляю конфигурацию"
scp -q "${root}/deploy/compose.yaml" "${host}:${dir}/docker-compose.yml"

echo "== перезапускаю"
# shellcheck disable=SC2029
ssh "${host}" "cd ${dir} && docker compose up -d && docker compose run --rm --no-deps site pnpm drizzle-kit migrate"

echo "== проверяю"
for _ in $(seq 1 10); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://arena.sethub.org/api/health || true)"
    [ "${code}" = "200" ] && { echo "сайт отвечает"; exit 0; }
    sleep 5
done
echo "сайт не ответил — смотри: ssh ${host} 'cd ${dir} && docker compose logs --tail 50 site'" >&2
exit 1

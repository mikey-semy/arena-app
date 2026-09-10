#!/usr/bin/env bash
# Собирает game/osp/secrets.cfg из .env. Файл в git не попадает.
#
# Зачем отдельный файл: OSP сбрасывает все cvar перед входом в пользовательский
# режим, поэтому пароль, выставленный в server.cfg, теряется. Подключается
# последней строкой cfg-modes/arena.cfg.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${root}/game/osp/secrets.cfg"

[ -f "${root}/.env" ] && . "${root}/.env"

cat > "${out}" <<CFG
// Сгенерирован scripts/render-secrets.sh. Руками не править.
set rconpassword "${Q3_RCON_PASSWORD:-}"
CFG

if [ -z "${Q3_RCON_PASSWORD:-}" ]; then
  echo "secrets.cfg собран, но Q3_RCON_PASSWORD пуст — rcon будет выключен"
else
  echo "secrets.cfg собран"
fi

#!/usr/bin/env bash
# Тянет игровой контент, который можно раздавать свободно, и говорит, чего не
# хватает. В git не попадает ничего из этого — см. .gitignore.
#
# Что НЕ качается и почему:
#   pak0.pk3      — контент id Software, есть только на диске. Кладётся руками
#                   в каталог из .env (Q3_BASEQ3). pak1..pak8 из поинт-релиза
#                   1.32 качаются сами: их id раздавала свободно
#
# pro-q3dm6 качать не нужно: она уже в pak6.pk3 поинт-релиза 1.32 вместе с
# pro-q3dm13, pro-q3tourney2 и pro-q3tourney4.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
osp_mirror="https://games.square-r00t.net/downloads/quake/quakeIII/osp"
osp_dir="${root}/game/content/osp"

# Паки мода OSP 1.03a. В образе сервера они уже есть; эта копия — для
# контент-сервера, с которого их будет тянуть браузерный клиент.
osp_paks=(zz-osp-pak0.pk3 zz-osp-pak1.pk3 zz-osp-pak2.pk3 zz-osp-pak3.pk3 zz-osp-server3a.pk3)

mkdir -p "${osp_dir}"

for pak in "${osp_paks[@]}"; do
  out="${osp_dir}/${pak}"
  if [ -s "${out}" ]; then
    echo "есть      ${pak}"
    continue
  fi
  echo "качаю     ${pak}"
  curl -fsSL --retry 3 -o "${out}.part" "${osp_mirror}/${pak}"
  mv "${out}.part" "${out}"
done

# Поинт-релиз 1.32: pak1..pak8. Ставим официальные поверх дисковых — при
# sv_pure 1 у клиента и сервера должен сойтись весь набор, а канон здесь 1.32.
baseq3_dir="${Q3_BASEQ3:-${root}/game/content/baseq3}"
case "${baseq3_dir}" in ./*) baseq3_dir="${root}/${baseq3_dir#./}";; esac
mkdir -p "${baseq3_dir}"

if [ -s "${baseq3_dir}/pak8.pk3" ]; then
  echo "есть      pak1..pak8 (поинт-релиз 1.32)"
else
  echo "качаю     поинт-релиз 1.32"
  pr="$(mktemp)"
  curl -fsSL --retry 3 -o "${pr}" \
    'https://cdn.playmorepromode.com/files/q3pointrelease_132-linux.run'
  # Это makeself-архив: заголовок-скрипт, дальше gzip+tar. Смещение — в самом
  # заголовке (skip=179), берём его оттуда, а не вписываем числом
  skip="$(head -c 4096 "${pr}" | grep -aoE '^skip=[0-9]+' | head -1 | cut -d= -f2)"
  tail -n "+${skip}" "${pr}" | gzip -cd \
    | bsdtar -xf - -C "${baseq3_dir}" --strip-components 1 \
        baseq3/pak1.pk3 baseq3/pak2.pk3 baseq3/pak3.pk3 baseq3/pak4.pk3 \
        baseq3/pak5.pk3 baseq3/pak6.pk3 baseq3/pak7.pk3 baseq3/pak8.pk3
  chmod 644 "${baseq3_dir}"/pak[1-8].pk3
  rm -f "${pr}"
fi

echo
missing=0

if [ -s "${baseq3_dir}/pak0.pk3" ]; then
  echo "есть      baseq3 (${baseq3_dir}): $(ls "${baseq3_dir}"/*.pk3 2>/dev/null | wc -l) pk3"
else
  echo "НЕ ХВАТАЕТ ${baseq3_dir}/pak0.pk3 — только со своего диска"
  missing=1
fi


exit "${missing}"

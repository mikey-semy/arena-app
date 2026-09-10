#!/usr/bin/env bash
# Самоподписанный сертификат для локальной разработки WebTransport.
#
# Браузер принимает такой сертификат только через serverCertificateHashes, а тот
# требует ровно этого: ECDSA P-256 и срок жизни не больше 14 суток. Поэтому
# берём 13 и перевыпускаем, когда протухнет. Для боевого контура так нельзя —
# там нужен домен и обычный сертификат.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${root}/var/dev-cert"
mkdir -p "${dir}"

openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -days 13 -sha256 \
    -keyout "${dir}/key.pem" -out "${dir}/cert.pem" \
    -subj "/CN=arena-dev" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

# Отпечаток в base64 — в таком виде его ждёт serverCertificateHashes в браузере
fp="$(openssl x509 -in "${dir}/cert.pem" -outform der \
      | openssl dgst -sha256 -binary | base64 -w0)"
printf '%s' "${fp}" > "${dir}/fingerprint.txt"

echo "сертификат:  ${dir}/cert.pem"
echo "годен до:    $(openssl x509 -in "${dir}/cert.pem" -noout -enddate | cut -d= -f2)"
echo "отпечаток:   ${fp}"

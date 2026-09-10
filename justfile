set shell := ["bash", "-uc"]

# Инструменты из mise.toml доступны рецептам без активации оболочки:
# just запускает их в неинтерактивном bash, куда mise сам себя не подкладывает
export PATH := env('HOME') + "/.local/share/mise/shims:" + env('PATH')

# Показать список команд
default:
    @just --list

# Поставить зависимости и хуки
setup:
    mise trust --quiet
    mise install
    git rev-parse --git-dir >/dev/null 2>&1 || git init -q
    mise exec -- lefthook install
    pnpm install

# Запустить локально
dev:
    pnpm dev

# Тесты
test:
    pnpm vitest run

# Линтер и форматирование — только проверка
lint:
    pnpm biome check .

# Починить всё, что чинится само
fix:
    pnpm biome check --write .

# Типы
typecheck:
    pnpm tsc --noEmit

# Границы слоёв: циклы и направление импортов между слоями
boundaries:
    #!/usr/bin/env bash
    set -uo pipefail
    # --ignore-known падает, если файла заморозки нет, — а у свежего проекта его и
    # не должно быть. Поэтому флаг добавляется только когда файл реально есть.
    known=""
    [ -f .dependency-cruiser-known-violations.json ] && known="--ignore-known"
    out=$(pnpm exec depcruise src --config .dependency-cruiser.cjs $known 2>&1)
    code=$?
    echo "$out"
    # «0 modules cruised» с кодом 0 — не успех, а необследованный проект:
    # так выглядит, например, отсутствующий typescript. Тихо пропускать нельзя.
    if echo "$out" | grep -q "(0 modules"; then
        echo "границы: не обследовано ни одного модуля — проверь .dependency-cruiser.cjs и tsconfig.json" >&2
        exit 1
    fi
    exit $code

# Заморозить нынешние нарушения: новые будут падать, старые — ждать своей очереди
boundaries-freeze:
    pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json
    @echo "заморожено. Починил старое — перезапусти эту команду, чтобы усушить список"

# То же, что гоняет CI. Источник истины — здесь, workflow только вызывает это
ci: lint typecheck boundaries test

# Тот же workflow, но в контейнере — как его выполнит GitHub.
# Дольше, зато ловит «а на чистой машине не собирается»
ci-container:
    @command -v act >/dev/null || { echo "нужен act: pacman -S act"; exit 1; }
    act push --rm

# Игровой контент: свободное скачать, про остальное сказать, чего не хватает
assets:
    ./scripts/fetch-assets.sh

# Собрать браузерный клиент в client/www
client-build:
    ./scripts/build-client.sh

# Отдать браузерный клиент локально: http://127.0.0.1:8099/
client: client-build
    @echo "открой http://127.0.0.1:8099/"
    cd client/www && python3 -m http.server 8099 --bind 127.0.0.1

# Сертификат для локальной разработки WebTransport (годен 13 суток)
dev-cert:
    ./scripts/dev-cert.sh

# Сайт: вход, аккаунты, дальше остальное
site:
    pnpm tsx src/server/index.ts

# Браузерное приложение в разработке (запросы к /api уходят на сайт)
web:
    pnpm vite

# Собрать браузерное приложение в var/site
web-build:
    pnpm vite build

# Сгенерировать миграцию по изменениям в схеме
db-generate:
    pnpm drizzle-kit generate

# Применить миграции к базе
db-migrate:
    pnpm drizzle-kit migrate

# Выписать ссылку-приглашение: just invite Витя
invite name:
    pnpm tsx src/proxy/invite.ts "{{name}}"

# Мост браузер↔игровой сервер: WebTransport снаружи, UDP внутрь
bridge:
    pnpm tsx src/proxy/bridge.ts

# Поднять игровой сервер
game:
    ./scripts/render-secrets.sh
    docker compose up q3

# Доставить секреты из локального .env в боевой и перезапустить сайт
deploy-env *keys:
    ./scripts/deploy-env.sh {{keys}}

# Выкатить сайт на arena.sethub.org
deploy:
    ./scripts/deploy-site.sh

# Собрать образ локально: VPS не должен собирать
build:
    docker build -t ghcr.io/mikey-semy/arena-app:latest .

# Отправить образ в реестр
push: build
    docker push ghcr.io/mikey-semy/arena-app:latest


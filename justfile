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

# Собрать образ локально: VPS не должен собирать
build:
    docker build -t ghcr.io/mikey-semy/arena-app:latest .

# Отправить образ в реестр
push: build
    docker push ghcr.io/mikey-semy/arena-app:latest


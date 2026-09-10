# arena-app

Clan Arena в браузере: игровой сервер, прокси и сайт вокруг

## Запуск

```bash
just setup
just dev
```

Всё остальное — `just --list`.

## Разработка

```bash
just test       # тесты
just fix        # починить стиль
just ci         # всё, что гоняет CI
```

TypeScript, пакеты через `pnpm`, линтер `biome`, тесты `vitest`.
Версии инструментов — в `mise.toml`, ставятся сами.

## Настройка

```bash
cp .env.example .env
```


## Сборка образа

```bash
just build
just push
```

Образ собирается **локально** и уезжает в реестр готовым — сервер не собирает.

---

Создан из шаблона [mikey-semy/project-template](https://github.com/mikey-semy/project-template).
Обновить до текущей версии шаблона: `copier update`.

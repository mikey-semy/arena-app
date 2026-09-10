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
cp .env.example .env      # прописать Q3_BASEQ3 — свой каталог с pak0..pak8
just assets               # свободный контент; скажет, чего не хватает
```

`pak0.pk3` в git не попадает и не качается — он только на диске с игрой.
Всё остальное `just assets` достаёт само: паки OSP и поинт-релиз 1.32,
в котором лежит и `pro-q3dm6`.

## Игровой сервер

```bash
docker compose up q3
```

`ioquake3` + мод OSP 1.03a, режим Clan Arena на CPM-физике без самоурона.
Конфиги — в `game/osp/`, разбор решений — в `AGENTS.md`.

## Браузерный клиент

```bash
just client               # собрать и отдать на http://127.0.0.1:8099/
```

Тот же `ioquake3`, собранный под Emscripten. Графика зашита минимальная.

## Игра по сети

```bash
just dev-cert     # один раз в 13 дней: сертификат для локальной разработки
just game         # выделенный сервер
just bridge       # мост: WebTransport снаружи, UDP внутрь
just client       # клиент
```

Открыть `http://127.0.0.1:8099/?connect=127.0.0.1:27961`.
Без `connect` клиент поднимает свою игру локально.

## Сайт

```bash
docker compose up -d db   # Postgres
just db-migrate           # схема
just site                 # сервер: вход, аккаунты, конфиги (127.0.0.1:3100)
just web                  # браузерное приложение (127.0.0.1:5273)
```

Вход через Discord. Заведи приложение на `discord.com/developers/applications`,
добавь в OAuth2 → Redirects адрес `SITE_URL` + `/api/auth/discord/callback`
и впиши `DISCORD_CLIENT_ID` с `DISCORD_CLIENT_SECRET` в `.env`.

## Позвать людей

```bash
just invite Витя
```

Печатает ссылку с билетом — её и отправлять. Мост проверит билет и пустит
игрока в матч под его именем. Ключ подписи — `ARENA_TICKET_SECRET` в `.env`;
пока он пуст, вход свободный.


## Сборка образа

```bash
just build
just push
```

Образ собирается **локально** и уезжает в реестр готовым — сервер не собирает.

---

Создан из шаблона [mikey-semy/project-template](https://github.com/mikey-semy/project-template).
Обновить до текущей версии шаблона: `copier update`.

## Боевой контур

`arena.sethub.org` на сервере `netcup`, каталог `/srv/arena`.

```bash
just deploy       # собрать, отправить, перезапустить, проверить
```

Сайт стоит за общим Traefik хоста: маршрут и сертификат задаются ярлыками
в `deploy/compose.yaml`, чужие файлы не трогаются. `.env` боевого контура
живёт только на сервере — свои пароли, своя база.

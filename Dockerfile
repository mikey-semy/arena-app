# Сайт: сервер и собранное браузерное приложение в одном образе.
#
# Собирается ЛОКАЛЬНО и уезжает на сервер готовым — прод не собирает. Причина не
# в идеологии: на том хосте живут чужие проекты и почта, и сборка, съевшая там
# память, уронит не только нас.
FROM node:24-trixie-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm vite build

# Debian 13, а не 12: готовый бинарь HTTP/3 собран под glibc 2.38, а в
# bookworm её 2.36 — контейнер моста падал с ERR_DLOPEN_FAILED.
FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Ставим и devDependencies: сервер запускается через tsx, а он лежит там.
# Компилировать TypeScript отдельно значило бы завести ещё один способ получить
# на проде не то, что прогнали тесты.
#
# Скрипты установки здесь НЕ запрещены, в отличие от стадии сборки: мосту нужен
# нативный бинарь HTTP/3. Запускается ровно один скрипт — список разрешённых
# пакетов закрыт в pnpm-workspace.yaml.
RUN pnpm install --frozen-lockfile && pnpm store prune
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY --from=build /app/var/site ./var/site
# Не от root. Образ node по умолчанию запускает всё от него, и дыра в
# приложении сразу даёт root внутри контейнера. Пользователь node в образе уже
# заведён — остаётся отдать ему каталог.
RUN chown -R node:node /app
USER node

EXPOSE 3100 27961/udp
# tsx, а не сборка в js: сервер — это несколько файлов, и лишний шаг сборки
# добавил бы способ получить на проде не то, что проверено тестами
CMD ["pnpm", "tsx", "src/server/index.ts"]

# Образ собирается ЛОКАЛЬНО и уезжает в реестр готовым — сервер не собирает.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .

FROM node:22-slim
WORKDIR /app
COPY --from=build /app /app
CMD ["node", "src/index.js"]

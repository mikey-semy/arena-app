# Браузерный клиент: ioquake3 под Emscripten.
#
# Тот же ioquake3, что и на сервере (game/Dockerfile) — протокол обязан совпадать.
# Emscripten-поддержка в upstream официальная: cmake/platforms/emscripten.cmake.
#
# Собирается локально, наружу уезжает готовым: emsdk на машину не ставится.

FROM emscripten/emsdk:latest AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/ioquake/ioq3.git .

# Свой сетевой слой вместо сокетного. В WebAssembly сокетов нет, поэтому
# официальная сборка идёт с net_enabled 0 и по сети не играет. Подменяем файл
# целиком, а не патчим: патч из десятка кусков разваливается на каждом
# обновлении движка. Разбор — в шапке самого файла.
COPY engine/net_wt.c code/qcommon/net_ip.c

# EMSCRIPTEN_PRELOAD_FILE выключен: паки грузятся по client-config.json
# отдельными файлами, иначе всё склеится в один .data на сотни мегабайт
RUN emcmake cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j"$(nproc)"
RUN ls -la build/Release/

FROM scratch AS artifacts
COPY --from=build /src/build/Release/ /

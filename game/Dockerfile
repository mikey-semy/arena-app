# Игровой сервер: ioquake3 (только ioq3ded) + паки мода OSP 1.03a.
#
# Почему свой образ, а не готовый: wokoman/docker-quake3-osp-server собран на
# debian:jessie, чьи репозитории отдают 404 — образ больше не собирается.
# Проверено 10.09.2026, лог: apt-get update, 404 на deb.debian.org/dists/jessie.
#
# Почему ioquake3, а не оригинальный бинарь 1.32: браузерный клиент — тоже
# ioquake3 (сборка под Emscripten), протокол должен совпадать.
#
# Собирается ЛОКАЛЬНО и уезжает в реестр готовым — VPS не собирает.

FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/ioquake/ioq3.git .
# Сборка через cmake, а не make: в ioquake3 Makefile больше нет, только CMakeLists.
# Только выделенный сервер: ни клиента, ни рендерера, ни пересборки игровых
# модулей — игровую логику даёт OSP своими qvm.
RUN cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SERVER=ON \
        -DBUILD_CLIENT=OFF \
        -DBUILD_RENDERER_GL1=OFF \
        -DBUILD_RENDERER_GL2=OFF \
        -DBUILD_GAME_LIBRARIES=OFF \
        -DBUILD_GAME_QVMS=OFF \
        -DUSE_OPENAL=OFF \
        -DUSE_CODEC_VORBIS=OFF \
        -DUSE_CODEC_OPUS=OFF \
        -DUSE_VOIP=OFF \
        -DUSE_MUMBLE=OFF \
    && cmake --build build -j"$(nproc)"
# Имя бинаря cmake задаёт сам и оно менялось — ищем, а не угадываем
RUN set -eux; \
    bin="$(find build -type f -executable ! -name '*.so' -name 'ioq*' | head -1)"; \
    test -n "$bin"; \
    cp "$bin" /ioq3ded; \
    /ioq3ded --version 2>&1 | head -3 || true

FROM debian:bookworm-slim AS osp
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /osp
# Зеркало полной поставки OSP 1.03a. Паки раздаются свободно, в отличие от pak0
ARG OSP_MIRROR=https://games.square-r00t.net/downloads/quake/quakeIII/osp
RUN for p in zz-osp-pak0.pk3 zz-osp-pak1.pk3 zz-osp-pak2.pk3 zz-osp-pak3.pk3 zz-osp-server3a.pk3; do \
        curl -fsSL --retry 3 -o "$p" "${OSP_MIRROR}/$p"; \
    done

FROM debian:bookworm-slim
RUN useradd --system --uid 1000 --create-home --home-dir /q3 q3
COPY --from=build /ioq3ded /usr/local/bin/ioq3ded
COPY --from=osp /osp /q3/osp
RUN mkdir -p /q3/baseq3 /q3/osp/logs && chown -R q3:q3 /q3
USER q3
WORKDIR /q3
EXPOSE 27960/udp
# fs_homepath тоже /q3: иначе логи уедут в ~/.q3a и наружу их не видно
ENTRYPOINT ["ioq3ded", "+set", "fs_basepath", "/q3", "+set", "fs_homepath", "/q3"]
# sv_pure 0, и это вынужденно. Проверка целостности требует, чтобы паки у
# клиента и сервера совпали до контрольной суммы. Но игрок приносит СВОЙ pak0 —
# у кого-то с диска, у кого-то из Steam, у кого-то из сборки, — и суммы
# расходятся. Выбор был между «никто не подключится» и «нет проверки паков».
#
# Чем платим: клиент может подсунуть себе изменённые текстуры — например,
# сделать модели ярче. Для игры с друзьями терпимо, для турнира нет. Вернуть
# проверку можно будет, когда у всех окажется один и тот же набор паков.
CMD ["+set", "dedicated", "1", "+set", "fs_game", "osp", "+set", "sv_pure", "0", "+exec", "server.cfg"]

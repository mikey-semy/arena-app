# Нативный клиент Quake для агента.
#
# Зачем нативный, а не браузерный: агенту не нужна картинка, нужна скорость и
# возможность запустить дюжину экземпляров разом. Браузер для этого — худший
# из возможных носителей.
#
# Рендерер собирается, но не используется: клиент запускается с пустым
# видеодрайвером SDL. Убрать рендерер совсем нельзя — движок без него
# не собирается как клиент, а переписывать это ради обучения незачем.
FROM debian:trixie-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates libsdl2-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/ioquake/ioq3.git .

# Интерфейс агента: состояние наружу, команда внутрь, строгий шаг.
COPY engine/cl_agent.c code/client/cl_agent.c
COPY engine/hooks.sh /tmp/hooks.sh
RUN sh /tmp/hooks.sh

RUN cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SERVER=OFF \
        -DBUILD_CLIENT=ON \
        -DBUILD_RENDERER_GL2=ON \
        -DBUILD_RENDERER_GL1=OFF \
        -DBUILD_GAME_LIBRARIES=OFF \
        -DBUILD_GAME_QVMS=OFF \
        -DUSE_RENDERER_DLOPEN=OFF \
        -DUSE_OPENAL=OFF \
        -DUSE_CODEC_VORBIS=OFF \
        -DUSE_CODEC_OPUS=OFF \
        -DUSE_VOIP=OFF \
        -DUSE_MUMBLE=OFF \
    && cmake --build build -j"$(nproc)"
RUN set -eux; \
    bin="$(find build -type f -executable ! -name '*.so' -name 'ioquake3*' | head -1)"; \
    test -n "$bin"; cp "$bin" /ioquake3-agent

FROM debian:trixie-slim
# Безоконный вывод. Пустой видеодрайвер SDL не годится: он не даёт OpenGL,
# а клиент Quake без него не стартует вовсе — проверено, падает на GLimp_Init.
# Драйвер offscreen работает через EGL, поэтому нужен программный рендерер mesa.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsdl2-2.0-0 libegl1 libgles2 libgl1 mesa-libgallium libglx-mesa0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1000 --create-home --home-dir /q3 q3
COPY --from=build /ioquake3-agent /usr/local/bin/ioquake3-agent
USER q3
WORKDIR /q3
ENV SDL_VIDEODRIVER=offscreen SDL_AUDIODRIVER=dummy \
    LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless GALLIUM_DRIVER=llvmpipe
ENTRYPOINT ["ioquake3-agent", "+set", "fs_basepath", "/q3", "+set", "fs_homepath", "/q3"]

# Забирает woff2 у Google Fonts и собирает @font-face. Вызывается из
# scripts/fetch-fonts.sh, руками запускать незачем.
import pathlib
import re
import urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
OUT = pathlib.Path("src/app/fonts")

# Только эти поднаборы: сайт русско-английский, остальное — мёртвый вес.
KEEP = {"latin", "latin-ext", "cyrillic"}

# Oswald — узкий и тяжёлый, для заголовков и кнопок; IBM Plex Sans — текст;
# IBM Plex Mono — данные: ники, теги кланов, счёт.
FAMILIES = [
    ("oswald", "Oswald:wght@500", 500),
    ("oswald", "Oswald:wght@700", 700),
    ("plexsans", "IBM+Plex+Sans:wght@400", 400),
    ("plexmono", "IBM+Plex+Mono:wght@600", 600),
]
NAMES = {"oswald": "Oswald", "plexsans": "IBM Plex Sans", "plexmono": "IBM Plex Mono"}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(request, timeout=30).read()


OUT.mkdir(parents=True, exist_ok=True)
faces = []
for slug, query, weight in FAMILIES:
    css = fetch(
        f"https://fonts.googleapis.com/css2?family={query}&display=swap&subset=latin,cyrillic"
    ).decode()
    # Каждый блок предваряется комментарием с именем поднабора
    for subset, body in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S):
        if subset not in KEEP:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        unicode_range = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
        name = f"{slug}-{weight}-{subset}.woff2"
        (OUT / name).write_bytes(fetch(url))
        faces.append((NAMES[slug], weight, name, unicode_range))

lines = [
    "/* Шрифты лежат у нас, а не на чужом CDN: сайт не должен переставать",
    " * читаться из-за того, что до Google не достучались. Поднаборы только",
    " * латиница и кириллица — греческий и вьетнамский нам не нужны.",
    " *",
    " * Собран скриптом, руками не править: scripts/fetch-fonts.sh */",
]
for family, weight, name, unicode_range in faces:
    lines += [
        "@font-face {",
        f'  font-family: "{family}";',
        "  font-style: normal;",
        f"  font-weight: {weight};",
        "  font-display: swap;",
        f'  src: url("./fonts/{name}") format("woff2");',
        f"  unicode-range: {unicode_range};",
        "}",
    ]
pathlib.Path("src/app/fonts.css").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"шрифтов: {len(faces)}")

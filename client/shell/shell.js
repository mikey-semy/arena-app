// Оболочка браузерного клиента. Основана на code/web/client.html.in из ioquake3,
// отличия: настройки графики зашиты, а не оставлены игроку, и мод по умолчанию osp.
//
// Отдельным файлом, а не внутри index.html: наша CSP не разрешает inline-скрипты
// (script-src 'self' 'wasm-unsafe-eval'). Инлайновый вариант браузер молча
// не выполнял, и страница вечно висела на «подготовка».

// Поломка внутри оболочки иначе не видна: экран загрузки просто остаётся на
// месте, и снаружи это неотличимо от медленной сети. Пишем причину на экран.
function breakdown(what) {
  const line = document.getElementById("what");
  if (line) line.textContent = String(what);
}
function mishap(what) {
  /* Выход из игры движок сообщает исключением ExitStatus. Это не поломка,
     и говорить о ней «сбой» — врать человеку, который сам нажал «Quit». */
  if (String(what).includes("ExitStatus")) return gameOver();
  breakdown(`сбой: ${what}`);
}
addEventListener("error", (e) => mishap(e.error ?? e.message));
addEventListener("unhandledrejection", (e) => mishap(e.reason));

// Минимальная графика — это не про пинг (пинг это RTT сети, рендер на него не
// влияет), а про время кадра, стабильность фреймтайма и объём загрузки.
// Обоснование целиком — в AGENTS.md, раздел «Клиент — минимальная графика».
const GRAPHICS = [
  "+set r_picmip 16", // текстуры до неразличимости
  "+set r_vertexLight 1", // без карт освещения
  "+set r_dynamiclight 0",
  "+set r_fastsky 1", // без неба
  "+set r_subdivisions 999", // без сглаживания кривых поверхностей
  "+set r_lodbias 2", // модели попроще
  "+set cg_shadows 0",
  "+set cg_marks 0",
  "+set cg_brassTime 0",
  "+set cg_simpleItems 1",
  "+set com_blood 0",
];

const params = new URLSearchParams(location.search);
const fs_game = params.get("fs_game") ?? "osp";

// Отпечаток самоподписанного сертификата моста. Нужен только в разработке:
// в боевом контуре у моста обычный сертификат и хеш не передаётся.
// Читает его сетевой слой движка (client/engine/net_wt.c).
const certHash = (
  params.get("cert") ??
  (await fetch("./fingerprint.txt")
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => ""))
).trim();

// Отпечаток — это ровно 32 байта в base64, то есть 44 символа. Проверяем, а не
// доверяем: сервер может ответить чем угодно, и однажды ответил страницей сайта
// вместо «файла нет». Клиент тогда умер на разборе, ничего не сказав.
if (/^[A-Za-z0-9+/]{43}=$/.test(certHash)) {
  globalThis.ARENA_CERT_HASH = certHash;
} else if (certHash) {
  console.warn("arena: отпечаток сертификата не похож на отпечаток, игнорирую");
}

// Куда подключаться. Пусто — играем локально, как раньше.
// Адрес читает сетевой слой движка: у браузерного клиента собеседник один.
const connectTo = params.get("connect") ?? "";
if (connectTo) globalThis.ARENA_BRIDGE = connectTo;

// Билет из ссылки-приглашения. Мост проверяет его до того, как пустит к игре.
const ticket = params.get("i") ?? "";
if (ticket) globalThis.ARENA_TICKET = ticket;

// Имя игрока лежит в билете открытым текстом — подпись его защищает от подмены,
// но не прячет. Читаем, чтобы человек вошёл под своим именем, а не
// «UnnamedPlayer». Проверяет подпись всё равно мост, здесь только показываем.
const CYRILLIC = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Шрифт Quake 3 знает только латиницу — кириллица превратилась бы в мусор. */
function playerName(raw) {
  const latin = [...raw.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join("");
  const clean = latin.replace(/[^A-Za-z0-9_.[\]-]/g, "_").slice(0, 20);
  return clean || "player";
}

let name = "";
if (ticket) {
  try {
    const payload = ticket.slice(0, ticket.indexOf("."));
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    if (typeof json.name === "string") name = playerName(json.name);
  } catch {
    // Билет нечитаемый — не наша забота, откажет мост
  }
}

// Разрешение кадра = размер окна. dpr ограничен двойкой: на HiDPI полный
// множитель даёт вчетверо больше пикселей на кадр, а нам важнее время кадра.
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const width = Math.max(640, Math.round(window.innerWidth * dpr));
const height = Math.max(480, Math.round(window.innerHeight * dpr));
canvas.width = width;
canvas.height = height;

const args = [
  "+set sv_pure 0",
  "+set net_enabled 1",
  "+set cl_motd 0", // не ходить на update.quake3arena.com: его нет
  "+set r_mode -1", // -1 = брать r_customwidth/r_customheight
  `+set r_customwidth ${width}`,
  `+set r_customheight ${height}`,
  "+set r_fullscreen 0",
  "+set r_noborder 1",
  "+set com_basegame baseq3",
  `+set fs_game "${fs_game}"`,
  ...GRAPHICS,
];
// Правила игры берутся из того же server.cfg, что читает выделенный сервер.
// Без этого локальная игра идёт на дефолтах OSP: предметы по всей карте,
// самоурон включён, физика ванильная.
// Локальная игра поднимает свой сервер по нашему конфигу. При подключении
// к чужому серверу этого делать нельзя — правила там задаёт он.
if (fs_game === "osp" && !connectTo) {
  args.push("+exec server.cfg");
  args.push("+set sv_pure 0"); // после конфига: там стоит 1, а локально это лишнее
}

// Клавиши для браузера. Выполняется всегда, а не только в локальной игре:
// без выбора команды Clan Arena не начнётся ни там, ни там.
if (fs_game === "osp") args.push("+exec arena.cfg");

if (name) args.push(`+set name ${name}`);
if (connectTo) args.push(`+connect ${connectTo}`);

// «+» в строке запроса надо писать как %2b, иначе браузер его съест
const extra = params.get("args");
if (extra) args.push(extra);

const config = await fetch("./ioquake3-config.json").then((r) => r.json());

// ── экран загрузки ──────────────────────────────────────────────────────────
// Первый заход тянет сотни мегабайт игровых паков. Без обратной связи это
// несколько минут чёрного экрана, и человек уходит, решив, что сломалось.
const loading = document.getElementById("loading");
const bar = document.querySelector("#bar i");
const what = document.getElementById("what");
const hint = document.getElementById("hint");

const mb = (bytes) => `${Math.round(bytes / 1048576)} МБ`;

// Обязательство GPLv2, а не вежливость: движок здесь изменённый ioquake3, и,
// отдавая его в браузер, мы обязаны показать, где взять исходники.
document.getElementById("source").innerHTML =
  'ioquake3 под GPLv2 · <a href="https://github.com/mikey-semy/arena-app" ' +
  'target="_blank" rel="noreferrer">исходники</a>';

hint.textContent = navigator.language.startsWith("ru")
  ? "Первый заход долгий: игра целиком качается в браузер. Дальше она останется в кэше."
  : "The first visit is slow: the whole game downloads into your browser. It stays cached afterwards.";

// ── свой pak0 ───────────────────────────────────────────────────────────────
// Паки baseq3 — контент id Software. Раздавать его мы не имеем права, поэтому
// игрок один раз указывает свою папку с игрой, а браузер держит копию у себя.
// Побочная выгода крупнее самой причины: первый заход перестал весить 422 МБ.
const ru = navigator.language.startsWith("ru");
const need = document.getElementById("need");
const needText = document.getElementById("need-text");
const needButton = document.getElementById("need-button");
const needNote = document.getElementById("need-note");
const pick = document.getElementById("pick");

needText.textContent = ru
  ? "Укажи папку baseq3 из своей установки Quake III Arena."
  : "Point at the baseq3 folder of your Quake III Arena install.";
needButton.textContent = ru ? "Выбрать папку" : "Choose folder";
// Своя кнопка вместо системного вида поля: выбор файлов выглядит одинаково
// уродливо во всех браузерах и не поддаётся оформлению
needButton.addEventListener("click", () => pick.click());
needNote.textContent = ru
  ? "Файлы игры остаются у тебя: браузер запомнит их и больше не спросит. Мы их не раздаём — это чужой контент, и права на него не наши."
  : "The game files stay with you: the browser remembers them and will not ask again. We do not distribute them — they are not ours to give.";

/** Хранилище браузера для больших файлов. Не IndexedDB: тут сотни мегабайт. */
async function gameStore() {
  if (!navigator.storage?.getDirectory) return undefined;
  try {
    // Без этого браузер вправе вычистить хранилище, когда захочет,
    // и человека попросят указать папку заново
    await navigator.storage.persist?.();
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle("baseq3", { create: true });
  } catch (err) {
    console.warn("arena: хранилище недоступно", err);
    return undefined;
  }
}

/**
 * Есть ли файл в хранилище. Отдельно от чтения намеренно: проверять наличие
 * через readStored значило бы тянуть 367 МБ pak0 в память ради ответа «да».
 */
async function haveStored(store, name) {
  if (!store) return false;
  try {
    await store.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function readStored(store, name) {
  if (!store) return undefined;
  try {
    const handle = await store.getFileHandle(name);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  } catch {
    return undefined;
  }
}

/** Кладём файл в хранилище потоком: 367 МБ через память лишний раз незачем. */
async function storeFile(store, name, file) {
  if (!store) return;
  const handle = await store.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await file.stream().pipeTo(writable);
}

/** Ждёт, пока игрок укажет папку, и складывает найденные паки в хранилище. */
function askForGame(store, wanted) {
  return new Promise((resolve) => {
    need.hidden = false;
    pick.addEventListener(
      "change",
      async () => {
        need.hidden = true;
        const chosen = [...pick.files];
        let saved = 0;
        for (const name of wanted) {
          const file = chosen.find((f) => f.name.toLowerCase() === name);
          if (!file) continue;
          what.textContent = (ru ? "сохраняю " : "saving ") + name;
          await storeFile(store, name, file);
          saved++;
        }
        resolve(saved);
      },
      { once: true },
    );
  });
}

/** Скачивает файл, считая байты: у fetch нет события прогресса, только поток. */
async function fetchCounting(url, onChunk) {
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onChunk(got, total);
  }
  const data = new Uint8Array(got);
  let at = 0;
  for (const part of parts) {
    data.set(part, at);
    at += part.length;
  }
  return data;
}

const ioquake3 = (await import("./ioquake3.js")).default;

// Последние строки вывода движка держим под рукой. Не отладочный костыль:
// когда игрок скажет «не работает», это единственное, что можно у него
// спросить, — в браузере нет ни консоли сервера, ни файла с логом.
globalThis.ARENA_LOG = [];
const remember = (line) => {
  const log = globalThis.ARENA_LOG;
  if (log.length > 400) log.shift();
  log.push(String(line));
  console.log(line);
};

/**
 * Показывает, чем заменены клавиши меню.
 *
 * Quake пишет «press ESC and use the START menu to play». В браузере ESC
 * снимает захват мыши и до меню не доходит, а в Clan Arena без выбора команды
 * человек остаётся зрителем и не понимает, что сделал не так.
 */
function showKeys() {
  if (fs_game !== "osp") return;
  const rows = ru
    ? [
        ["K", "красные"],
        ["L", "синие"],
        ["O", "смотреть"],
        ["P", "готов"],
        ["M", "меню"],
      ]
    : [
        ["K", "red"],
        ["L", "blue"],
        ["O", "spectate"],
        ["P", "ready"],
        ["M", "menu"],
      ];
  document.getElementById("keys-title").textContent = ru ? "Играть:" : "Play:";
  document.getElementById("keys-list").replaceChildren(
    ...rows.flatMap(([key, what]) => {
      const box = document.createElement("kbd");
      box.textContent = key;
      const label = document.createElement("span");
      label.textContent = what;
      return [box, label];
    }),
  );
  const keys = document.getElementById("keys");
  keys.hidden = false;
  document.getElementById("keys-close").addEventListener("click", () => keys.remove());
}

/**
 * Игра закончилась сама: человек выбрал «Quit» в меню.
 *
 * Нативный Quake на этом закрывает окно, а в браузере закрывать нечего: движок
 * останавливается на экране титров id Software, и выйти оттуда уже некуда.
 * Показываем дверь обратно на сайт — оттуда берётся новый билет на вход.
 */
function gameOver() {
  if (document.getElementById("over")) return;
  /* Свой признак языка, а не общий ru: тот объявлен ниже по файлу, и позовись
     эта функция раньше — она упала бы сама, вместо того чтобы показать выход. */
  const inRu = navigator.language.startsWith("ru");
  const box = document.createElement("div");
  box.id = "over";
  const text = document.createElement("p");
  /* «Игра закрыта», а не «ты вышел»: этим же путём движок уходит и когда
     падает сам, и утверждать в этом случае, что человек вышел, — неправда. */
  text.textContent = inRu ? "Игра закрыта." : "The game has closed.";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "pick";
  back.textContent = inRu ? "Вернуться на сайт" : "Back to the site";
  back.addEventListener("click", () => {
    location.href = "/";
  });
  box.append(text, back);
  document.body.append(box);
}

remember(`АРГУМЕНТЫ: ${args.join(" ")}`);

ioquake3({
  canvas,
  print: remember,
  printErr: remember,
  arguments: args.join(" ").split(/\s+/),
  locateFile: (f) => `./${f}`,
  preRun: [
    async (module) => {
      module.addRunDependency("content");
      try {
        const files = ["baseq3", fs_game]
          .filter((dir) => dir && config[dir])
          .flatMap((dir) => config[dir].files);

        const nameOf = (file) => file.src.match(/[^/]+$/)[0].toLowerCase();
        const store = await gameStore();

        // Чего из своей папки не хватает. Спрашиваем один раз за всё:
        // просить указывать папку по файлу — издевательство.
        const missing = [];
        for (const file of files.filter((f) => f.own))
          if (!(await haveStored(store, nameOf(file)))) missing.push(nameOf(file));

        if (missing.length) {
          bar.style.width = "0%";
          what.textContent = ru ? "нужна твоя копия игры" : "your copy of the game is needed";
          await askForGame(store, missing);
        }

        // Взвешиваем по байтам, а не по числу файлов: pak0 — это 87%
        // всего объёма, и полоса «файл 1 из 23» врала бы в разы.
        const weight = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
        let loaded = 0;
        let done = 0;
        for (const file of files) {
          const name = file.src.match(/[^/]+$/)[0];
          what.textContent = `${name} · ${done + 1}/${files.length} · ${mb(loaded)} из ${mb(weight)}`;

          const data = file.own
            ? await readStored(store, name.toLowerCase())
            : await fetchCounting(file.src, (got) => {
                bar.style.width = `${((loaded + got) / weight) * 100}%`;
              });

          loaded += file.size ?? 0;
          bar.style.width = `${(loaded / weight) * 100}%`;
          done++;
          if (!data) continue; // необязательные файлы просто пропускаем
          module.FS.mkdirTree(file.dst);
          module.FS.writeFile(`${file.dst}/${name}`, data);
        }
        what.textContent = "запуск";
        bar.style.width = "100%";
      } finally {
        module.removeRunDependency("content");
      }
    },
  ],
  // Движок дошёл до первого кадра — экран загрузки больше не нужен,
  // зато нужна подсказка: игра предлагает нажать ESC, а он тут не работает.
  onRuntimeInitialized: () => {
    loading.remove();
    showKeys();
  },
  // Иначе исключение внутри движка уходит в пустоту, и снаружи это выглядит
  // как чёрный экран без единой строчки объяснения
  onExit: () => gameOver(),
  onAbort: (reason) => remember(`ДВИЖОК ОСТАНОВЛЕН: ${reason}`),
});

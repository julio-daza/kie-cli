export type Lang = "en" | "es";

export const LANGS: Record<Lang, string> = { en: "English", es: "Español" };
export const REPO = "https://github.com/julio-daza/kie-cli";

const en = {
  meta: {
    title: "kie — KIE.ai media generation CLI for agents",
    description:
      "Generate images and video on KIE.ai from the terminal or from an AI agent. Zero dependencies, key in the OS keychain, no callbacks, hard spend guards.",
  },
  nav: { features: "Why", install: "Install", docs: "Docs", skill: "Agent skill", github: "GitHub", lang: "ES" },
  hero: {
    eyebrow: "Open source · MIT · 0 runtime dependencies",
    headline: "Generate media. Keep your keys.",
    sub: "A command-line tool that lets AI agents create images and video on KIE.ai — without ever handing them the API key, and with a hard ceiling on what a single run can spend.",
    ctaPrimary: "Get started",
    ctaSecondary: "Read the docs",
    copy: "Copy",
    copied: "Copied",
    terminalTitle: "kie help",
  },
  trust: [
    { k: "0", v: "runtime dependencies" },
    { k: "2", v: "hosts it talks to — both KIE's" },
    { k: "40", v: "tests, no network" },
    { k: "3", v: "spend checks before every request" },
  ],
  why: {
    eyebrow: "Why another CLI",
    title: "Built for the one thing other wrappers get wrong: the key is paid.",
    lead: "Media APIs are the most expensive credentials to leak. Most integrations read the key from an env var, pull in hundreds of packages and ship a default webhook. kie does none of that.",
    cards: [
      {
        t: "Key in the keychain",
        d: "Stored in macOS Keychain (0600 file elsewhere). Env vars need an explicit opt-in. Every byte of output goes through a redactor.",
      },
      {
        t: "No third-party egress",
        d: "Talks only to api.kie.ai and KIE's upload host. Never sends a callBackUrl — results are polled, nothing about your generations is pushed anywhere.",
      },
      {
        t: "Spend guard, before the request",
        d: "Per-task cap, a daily budget computed from the real credits KIE reports, and a balance check. Blocked means nothing left your machine.",
      },
      {
        t: "Agent-native contract",
        d: "JSON on stdout, messages on stderr, exit codes you can branch on. Pretty tables when a human runs it in a terminal.",
      },
      {
        t: "Zero dependencies",
        d: "Node ≥ 20 built-ins only. The code that touches your key is ~700 lines you can read before trusting it.",
      },
      {
        t: "Always downloads",
        d: "KIE result URLs expire in 24 hours. kie writes files to disk and hands back paths, never links.",
      },
    ],
  },
  install: {
    eyebrow: "Install",
    title: "Two minutes, done right.",
    steps: [
      {
        t: "Clone and link",
        d: "Dev dependencies only (TypeScript). `npm link` puts `kie` on your PATH.",
        code: `git clone ${REPO}.git\ncd kie-cli/kie\nnpm install && npm run build && npm link`,
      },
      {
        t: "Create a dedicated key",
        d: "At kie.ai/api-key, make a key just for agents and set hourly/daily caps plus an IP whitelist. KIE enforces those even if this CLI is bypassed.",
        code: "# https://kie.ai/api-key → new key → caps + IP whitelist",
      },
      {
        t: "Store it, verify it",
        d: "Input is hidden. The key goes to the Keychain and never appears in output again.",
        code: "kie key set\nkie key check",
      },
    ],
  },
  usage: {
    eyebrow: "Usage",
    title: "One command per job.",
    tabs: { image: "Image", video: "Video", edit: "Edit with a reference", raw: "Any model" },
    image: `kie image nano-banana-2 \\
  --prompt "isometric coffee shop, warm light" \\
  --aspect 16:9 --resolution 2K --out ./assets`,
    video: `kie video kling-3.0 \\
  --prompt "drone shot over a fjord at dawn" \\
  --duration 5 --sound --max-credits 80`,
    edit: `kie upload ./sketch.png          # → temporary URL
kie image nano-banana-2 \\
  --prompt "same scene at night" \\
  --ref https://…/sketch.png`,
    raw: `kie run some-vendor/some-model \\
  --input '{"prompt":"…"}' --max-credits 30`,
    resultTitle: "What comes back",
  },
  guard: {
    eyebrow: "Spend guard",
    title: "Blocked means nothing was sent.",
    lead: "KIE doesn't publish per-model prices in its API docs, so kie doesn't guess. It layers three independent checks and refuses with exit code 3 if any fails.",
    checks: [
      { n: "01", t: "Per-task cap", d: "Models with a verified price are compared against maxCreditsPerTask. Everything else requires an explicit --max-credits — the agent has to say out loud how much it accepts to spend." },
      { n: "02", t: "Daily budget", d: "A local ledger records every task; when it completes, the real creditsConsumed is written back. Pending tasks count at their cap, so a burst can't overshoot." },
      { n: "03", t: "Balance", d: "If the estimate exceeds what's left on the account, the request never leaves." },
    ],
    exit: "Exit codes",
    codes: [
      ["0", "success"],
      ["1", "task failed on KIE's side"],
      ["2", "usage error"],
      ["3", "blocked by the spend guard"],
      ["4", "timed out — task still running, resume with kie wait"],
      ["5", "API / auth error"],
    ],
  },
  docs: {
    eyebrow: "Documentation",
    title: "Commands",
    commands: [
      ["kie key set|check|delete", "Store the API key (Keychain / 0600 file), verify it, remove it."],
      ["kie credits", "Balance plus today's spend against the daily budget."],
      ["kie models [--kind image|video]", "Curated catalog with the flags each model supports."],
      ["kie image <model> --prompt … [opts]", "Generate an image, wait, download."],
      ["kie video <model> --prompt … [opts]", "Generate a video, wait, download."],
      ["kie run <model-id> --input '{…}' --max-credits N", "Escape hatch for any KIE Market model."],
      ["kie status <taskId>", "One poll, no download."],
      ["kie wait <taskId> [--out dir]", "Poll until done, download, settle the ledger."],
      ["kie upload <file>", "Local file → temporary URL for --ref / --image (KIE deletes it after ~3 days)."],
      ["kie ledger [--limit 20]", "Local spend log with real creditsConsumed."],
      ["kie config set <key> <value>", "dailyBudget · maxCreditsPerTask · outDir · pollSeconds · waitTimeoutSeconds"],
    ],
    flagsTitle: "Generation flags",
    flags: [
      ["--prompt <text>", "The prompt."],
      ["--ref <url>", "Reference image, repeatable (edit / style / multimodal reference)."],
      ["--image <url> / --end-image <url>", "First and last frame for video."],
      ["--aspect, --resolution, --duration", "16:9 · 1K|2K|4K|720p · seconds"],
      ["--sound, --fast, --format", "Native audio · cheaper variant · png|jpg"],
      ["--set key=value", "Raw model field, repeatable. callBackUrl is rejected."],
      ["--max-credits <n>", "Accept spending up to n credits on this task."],
      ["--dry-run", "Print the exact request, send nothing."],
      ["--out <dir>, --name <base>, --no-wait", "Where files go · base filename · submit and return."],
      ["--json, --pretty, --no-color, --quiet", "Output control. JSON is automatic when piped."],
    ],
    catalogTitle: "Catalog",
    catalog: [
      ["nano-banana-2", "image", "Google Nano Banana 2 — generate + edit with up to 14 refs. Est. 1K=8 · 2K=12 · 4K=18 credits."],
      ["seedream-v4", "image", "ByteDance Seedream V4 — text-to-image, switches to edit with --ref."],
      ["kling-3.0", "video", "Kling 3.0 — 3–15 s, native audio, --set mode=pro."],
      ["seedance-2.5", "video", "ByteDance Seedance 2.5 — frames or multimodal refs, 4–30 s."],
      ["minimax-h3", "video", "MiniMax H3 — sub-model chosen from your flags (text / image / reference)."],
      ["veo3", "video", "Google Veo 3 — own endpoint, --fast for veo3_fast."],
    ],
    more: "Full reference in the README",
  },
  skill: {
    eyebrow: "Agent skill",
    title: "Teach your agent the etiquette.",
    lead: "The repo ships a Claude Code skill (Agent Skills spec). It tells the agent when to generate, which model to pick, to check the budget first, to always pass --max-credits on video, and to return file paths — never URLs.",
    code: `ln -s "$PWD/skill/kie-media" ~/.claude/skills/kie-media`,
    rules: [
      "Check kie credits before the first generation.",
      "Images first, video only after the user approves the look.",
      "Exit 3 → report the reason, never retry with a bigger cap on its own.",
      "Never ask for, echo or set the API key.",
    ],
  },
  faq: {
    eyebrow: "FAQ",
    items: [
      { q: "Is this affiliated with KIE.ai?", a: "No. It's an independent, community project. KIE and its logo are trademarks of their owner, used only to identify the service." },
      { q: "Does it work on Linux or Windows?", a: "Yes. Without a Keychain the key is stored in ~/.config/kie/key with 0600 permissions. Everything else is identical." },
      { q: "Why no npm package yet?", a: "It will come once the flags settle, published from CI with provenance so the tarball is verifiable against the commit. Until then: clone + npm link." },
      { q: "What if a model isn't in the catalog?", a: "kie run <model-id> --input '{…}' --max-credits N sends any KIE Market model. Check the schema on docs.kie.ai first, or use --dry-run." },
      { q: "Can I use it without an agent?", a: "Of course. In a terminal it renders tables, panels and a live spinner; pipe it and you get JSON." },
    ],
  },
  cta: {
    title: "Give your agents a camera, not your wallet.",
    button: "View on GitHub",
    sub: "MIT licensed. Read the source before you trust it with a key — that's the point.",
  },
  footer: { built: "Built by Julio Daza. Not affiliated with KIE.ai.", license: "MIT License" },
};

const es: typeof en = {
  meta: {
    title: "kie — CLI de generación de medios en KIE.ai para agentes",
    description:
      "Genera imágenes y video en KIE.ai desde la terminal o desde un agente de IA. Cero dependencias, key en el llavero del sistema, sin callbacks, límites de gasto estrictos.",
  },
  nav: { features: "Por qué", install: "Instalar", docs: "Docs", skill: "Skill de agente", github: "GitHub", lang: "EN" },
  hero: {
    eyebrow: "Open source · MIT · 0 dependencias en runtime",
    headline: "Genera medios. Conserva tus llaves.",
    sub: "Una herramienta de línea de comandos para que los agentes de IA creen imágenes y video en KIE.ai — sin entregarles nunca la API key, y con un techo duro a lo que puede gastar una sola ejecución.",
    ctaPrimary: "Empezar",
    ctaSecondary: "Leer la documentación",
    copy: "Copiar",
    copied: "Copiado",
    terminalTitle: "kie help",
  },
  trust: [
    { k: "0", v: "dependencias en runtime" },
    { k: "2", v: "hosts con los que habla — ambos de KIE" },
    { k: "40", v: "tests, sin red" },
    { k: "3", v: "chequeos de gasto antes de cada request" },
  ],
  why: {
    eyebrow: "Por qué otra CLI",
    title: "Construida para lo único que otros wrappers hacen mal: la llave cuesta dinero.",
    lead: "Las APIs de medios son las credenciales más caras de perder. La mayoría de integraciones leen la key de una variable de entorno, arrastran cientos de paquetes y traen un webhook por defecto. kie no hace nada de eso.",
    cards: [
      {
        t: "Key en el llavero",
        d: "Se guarda en el Keychain de macOS (archivo 0600 en otros sistemas). Las variables de entorno requieren opt-in explícito. Toda la salida pasa por un redactor.",
      },
      {
        t: "Sin salidas a terceros",
        d: "Solo habla con api.kie.ai y el host de subida de KIE. Nunca envía callBackUrl — los resultados se consultan por polling, nada de tus generaciones se empuja a ningún lado.",
      },
      {
        t: "Guardia de gasto, antes del request",
        d: "Tope por tarea, presupuesto diario calculado con los créditos reales que reporta KIE y chequeo de saldo. Bloqueado significa que nada salió de tu máquina.",
      },
      {
        t: "Contrato nativo para agentes",
        d: "JSON en stdout, mensajes en stderr, códigos de salida para bifurcar. Tablas legibles cuando lo ejecuta un humano en la terminal.",
      },
      {
        t: "Cero dependencias",
        d: "Solo built-ins de Node ≥ 20. El código que toca tu key son ~700 líneas que puedes leer antes de confiarle nada.",
      },
      {
        t: "Siempre descarga",
        d: "Las URLs de resultado de KIE expiran en 24 horas. kie escribe archivos a disco y devuelve rutas, nunca enlaces.",
      },
    ],
  },
  install: {
    eyebrow: "Instalación",
    title: "Dos minutos, bien hechos.",
    steps: [
      {
        t: "Clona y enlaza",
        d: "Solo dependencias de desarrollo (TypeScript). `npm link` deja `kie` en tu PATH.",
        code: `git clone ${REPO}.git\ncd kie-cli/kie\nnpm install && npm run build && npm link`,
      },
      {
        t: "Crea una key dedicada",
        d: "En kie.ai/api-key crea una key solo para agentes y ponle topes por hora/día más una lista blanca de IPs. KIE los aplica aunque alguien se salte esta CLI.",
        code: "# https://kie.ai/api-key → nueva key → topes + IP whitelist",
      },
      {
        t: "Guárdala y verifícala",
        d: "La entrada está oculta. La key va al llavero y no vuelve a aparecer en ninguna salida.",
        code: "kie key set\nkie key check",
      },
    ],
  },
  usage: {
    eyebrow: "Uso",
    title: "Un comando por trabajo.",
    tabs: { image: "Imagen", video: "Video", edit: "Editar con referencia", raw: "Cualquier modelo" },
    image: `kie image nano-banana-2 \\
  --prompt "cafetería isométrica, luz cálida" \\
  --aspect 16:9 --resolution 2K --out ./assets`,
    video: `kie video kling-3.0 \\
  --prompt "toma de dron sobre un fiordo al amanecer" \\
  --duration 5 --sound --max-credits 80`,
    edit: `kie upload ./boceto.png          # → URL temporal
kie image nano-banana-2 \\
  --prompt "la misma escena de noche" \\
  --ref https://…/boceto.png`,
    raw: `kie run algun-vendor/algun-modelo \\
  --input '{"prompt":"…"}' --max-credits 30`,
    resultTitle: "Lo que vuelve",
  },
  guard: {
    eyebrow: "Guardia de gasto",
    title: "Bloqueado significa que no se envió nada.",
    lead: "KIE no publica precios por modelo en su documentación de API, así que kie no adivina. Apila tres chequeos independientes y rechaza con código de salida 3 si alguno falla.",
    checks: [
      { n: "01", t: "Tope por tarea", d: "Los modelos con precio verificado se comparan contra maxCreditsPerTask. Todo lo demás exige un --max-credits explícito — el agente tiene que decir en voz alta cuánto acepta gastar." },
      { n: "02", t: "Presupuesto diario", d: "Un ledger local registra cada tarea; al completarse se escribe el creditsConsumed real. Las tareas pendientes cuentan por su tope, así una ráfaga no se pasa." },
      { n: "03", t: "Saldo", d: "Si la estimación supera lo que queda en la cuenta, el request nunca sale." },
    ],
    exit: "Códigos de salida",
    codes: [
      ["0", "éxito"],
      ["1", "la tarea falló del lado de KIE"],
      ["2", "error de uso"],
      ["3", "bloqueado por la guardia de gasto"],
      ["4", "tiempo agotado — la tarea sigue corriendo, retoma con kie wait"],
      ["5", "error de API / autenticación"],
    ],
  },
  docs: {
    eyebrow: "Documentación",
    title: "Comandos",
    commands: [
      ["kie key set|check|delete", "Guardar la API key (Keychain / archivo 0600), verificarla, eliminarla."],
      ["kie credits", "Saldo más el gasto de hoy contra el presupuesto diario."],
      ["kie models [--kind image|video]", "Catálogo curado con los flags que soporta cada modelo."],
      ["kie image <modelo> --prompt … [opts]", "Generar una imagen, esperar, descargar."],
      ["kie video <modelo> --prompt … [opts]", "Generar un video, esperar, descargar."],
      ["kie run <model-id> --input '{…}' --max-credits N", "Vía de escape para cualquier modelo del Market de KIE."],
      ["kie status <taskId>", "Una consulta, sin descarga."],
      ["kie wait <taskId> [--out dir]", "Consultar hasta terminar, descargar, cerrar el ledger."],
      ["kie upload <archivo>", "Archivo local → URL temporal para --ref / --image (KIE lo borra a los ~3 días)."],
      ["kie ledger [--limit 20]", "Registro local de gasto con creditsConsumed reales."],
      ["kie config set <clave> <valor>", "dailyBudget · maxCreditsPerTask · outDir · pollSeconds · waitTimeoutSeconds"],
    ],
    flagsTitle: "Flags de generación",
    flags: [
      ["--prompt <texto>", "El prompt."],
      ["--ref <url>", "Imagen de referencia, repetible (edición / estilo / referencia multimodal)."],
      ["--image <url> / --end-image <url>", "Primer y último frame para video."],
      ["--aspect, --resolution, --duration", "16:9 · 1K|2K|4K|720p · segundos"],
      ["--sound, --fast, --format", "Audio nativo · variante barata · png|jpg"],
      ["--set clave=valor", "Campo crudo del modelo, repetible. callBackUrl se rechaza."],
      ["--max-credits <n>", "Aceptar gastar hasta n créditos en esta tarea."],
      ["--dry-run", "Imprime el request exacto, no envía nada."],
      ["--out <dir>, --name <base>, --no-wait", "Dónde van los archivos · nombre base · enviar y volver."],
      ["--json, --pretty, --no-color, --quiet", "Control de salida. JSON es automático al hacer pipe."],
    ],
    catalogTitle: "Catálogo",
    catalog: [
      ["nano-banana-2", "imagen", "Google Nano Banana 2 — genera + edita con hasta 14 referencias. Est. 1K=8 · 2K=12 · 4K=18 créditos."],
      ["seedream-v4", "imagen", "ByteDance Seedream V4 — texto a imagen, pasa a edición con --ref."],
      ["kling-3.0", "video", "Kling 3.0 — 3–15 s, audio nativo, --set mode=pro."],
      ["seedance-2.5", "video", "ByteDance Seedance 2.5 — frames o referencias multimodales, 4–30 s."],
      ["minimax-h3", "video", "MiniMax H3 — elige el submodelo según tus flags (texto / imagen / referencia)."],
      ["veo3", "video", "Google Veo 3 — endpoint propio, --fast para veo3_fast."],
    ],
    more: "Referencia completa en el README",
  },
  skill: {
    eyebrow: "Skill de agente",
    title: "Enséñale la etiqueta a tu agente.",
    lead: "El repo incluye un skill para Claude Code (spec Agent Skills). Le dice al agente cuándo generar, qué modelo elegir, que revise el presupuesto primero, que siempre pase --max-credits en video y que devuelva rutas de archivo — nunca URLs.",
    code: `ln -s "$PWD/skill/kie-media" ~/.claude/skills/kie-media`,
    rules: [
      "Revisar kie credits antes de la primera generación.",
      "Primero imágenes; video solo cuando el usuario aprueba el look.",
      "Exit 3 → reportar la razón, nunca reintentar con un tope mayor por su cuenta.",
      "Nunca pedir, mostrar ni configurar la API key.",
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    items: [
      { q: "¿Está afiliado a KIE.ai?", a: "No. Es un proyecto independiente de la comunidad. KIE y su logo son marcas de su propietario, usadas solo para identificar el servicio." },
      { q: "¿Funciona en Linux o Windows?", a: "Sí. Sin Keychain, la key se guarda en ~/.config/kie/key con permisos 0600. Todo lo demás es idéntico." },
      { q: "¿Por qué todavía no hay paquete en npm?", a: "Llegará cuando los flags se estabilicen, publicado desde CI con provenance para que el tarball sea verificable contra el commit. Mientras tanto: clone + npm link." },
      { q: "¿Y si un modelo no está en el catálogo?", a: "kie run <model-id> --input '{…}' --max-credits N envía cualquier modelo del Market de KIE. Revisa el schema en docs.kie.ai primero, o usa --dry-run." },
      { q: "¿Puedo usarlo sin un agente?", a: "Claro. En la terminal muestra tablas, paneles y un spinner en vivo; si haces pipe obtienes JSON." },
    ],
  },
  cta: {
    title: "Dale a tus agentes una cámara, no tu billetera.",
    button: "Ver en GitHub",
    sub: "Licencia MIT. Lee el código antes de confiarle una key — de eso se trata.",
  },
  footer: { built: "Hecho por Julio Daza. Sin afiliación con KIE.ai.", license: "Licencia MIT" },
};

export const ui: Record<Lang, typeof en> = { en, es };

export function t(lang: Lang) {
  return ui[lang];
}

export function localePath(lang: Lang, path = "/"): string {
  return lang === "en" ? path : `/es${path === "/" ? "/" : path}`;
}

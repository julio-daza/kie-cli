<p align="center">
  <a href="https://kiecli.com/es/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/logo-dark.png">
      <img src="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/logo-light.png" alt="KIE CLI" width="320">
    </picture>
  </a>
</p>

<p align="center">
  <strong>Genera medios. Conserva tus llaves.</strong><br>
  La CLI sin dependencias que permite a los agentes de IA crear imágenes y video en <a href="https://kie.ai">KIE.ai</a> — sin ver nunca la API key, y sin gastar más de lo que autorizas.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@uxdata-co/kie"><img src="https://img.shields.io/npm/v/%40uxdata-co%2Fkie?logo=npm&color=cb3837" alt="npm"></a>
  <a href="https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml"><img src="https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@uxdata-co/kie"><img src="https://img.shields.io/badge/dependencias-0-00a8ff" alt="0 dependencias"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licencia-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Español</b> · <a href="https://kiecli.com/es/docs">Docs</a> · <a href="https://kiecli.com/es/#tutorials">Usar desde el chat</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/terminal.png" alt="kie en una terminal: banner de KIE, panel de créditos con medidor de presupuesto y una generación de imagen completándose con la ruta del archivo y los créditos gastados" width="640">
</p>

> **¿Usas un agente de IA?** Apúntalo a **<https://kiecli.com/skill.md>** — una
> sola página autocontenida con la instalación, la guardia de gasto, la tabla de
> modelos, el contrato `--json` y todos los códigos de salida. O dile:
> `Read https://kiecli.com/skill.md`

```bash
npm i -g @uxdata-co/kie
kie key set            # pega la key una vez → llavero del sistema (Keychain · DPAPI · Secret Service)
kie skill install      # enseña a Claude Code, Codex, Cursor y Gemini CLI a usarla
kie image nano-banana-2 --prompt "cafetería isométrica, luz cálida" --aspect 16:9
```

## Apoya este proyecto

`kie` corre sobre **KIE.ai**: los mismos modelos Veo, Nano Banana, GPT Image, Kling y Seedance que
sirven las APIs oficiales, hasta **84% más barato** — −86% en GPT Image 2, −61% en Veo 3.1, −50% en
Nano Banana 2. Billetera prepaga, sin cargos ocultos, y las generaciones fallidas nunca se cobran.

<p align="center">
  <a href="https://kie.ai?ref=abddfed9f3893359a999113356686aaa"><img src="https://img.shields.io/badge/Reg%C3%ADstrate%20en%20Kie-Apoya%20este%20proyecto-00a8ff?style=for-the-badge" alt="Regístrate en Kie"></a>
</p>

<p align="center">
  <sub>Al registrarte con este link de afiliado apoyas el mantenimiento y actualización de este código.</sub>
</p>

## Por qué kie

Las APIs de medios son las credenciales más caras de perder: una key filtrada puede quemar
cientos de dólares en generación de video en una tarde. La mayoría de integraciones con KIE
leen la key de una variable de entorno, arrastran cientos de paquetes de npm y traen un webhook
por defecto. `kie` está construida sobre las premisas contrarias.

| | **kie** (`@uxdata-co/kie`) | [felores/kie-cli-mcp](https://github.com/felores/kie-cli-mcp) |
|---|---|---|
| Dependencias en runtime | **0** — solo built-ins de Node; ~700 líneas que puedes auditar antes de confiar | 582 paquetes en el lockfile (`sqlite3`, `express`, `yargs`, SDK de MCP…) |
| Dónde vive la API key | **Llavero del sistema** — Keychain de macOS, DPAPI de Windows, Secret Service de Linux (archivo 0600 como respaldo); variable de entorno solo con opt-in explícito; la salida se redacta | Variable de entorno `KIE_AI_API_KEY` |
| Hosts de salida | **Solo `api.kie.ai` y el host de subida de KIE**; `callBackUrl` se rechaza en todas partes | Los mismos hosts de KIE, pero cada tarea se crea con un `callBackUrl` fijo → `proxy.kie.ai/mcp-callback` salvo que lo sobrescribas |
| Protección de gasto | **Tres chequeos antes de que el request salga**: tope por tarea, presupuesto diario con un ledger de `creditsConsumed` *reales*, saldo. Bloqueado = exit 3, nada enviado | Flujo de cotizar + aprobar (`prepare_media_generation` → `submit_media_generation`); sin ledger diario |
| Integración con agentes | **Agent Skills** para Claude Code, Codex, Cursor, Gemini CLI (`kie skill install`) **más un servidor MCP solo-stdio** para Claude Desktop / app de Codex / Cursor (`kie mcp install`); las imágenes se ven en el chat | Servidor MCP (stdio/HTTP) + servidor compatible con OpenAI; el modo HTTP expone a la red el proceso que tiene la key |
| Releases | Publicadas desde GitHub Actions con **provenance de npm** (trusted publishing; sin tokens) | Publicadas a mano |
| UX para humanos | Banner de marca, tablas que se ajustan a tu terminal, medidor de presupuesto, spinner en vivo; JSON estricto al hacer pipe | Salida JSON / herramientas MCP |
| Resultados | Siempre descargados a disco; devuelve rutas de archivo (las URLs de KIE expiran en 24 h) | Devuelve URLs de KIE; rendezvous por callback opcional |
| Cobertura de modelos | Curada: Nano Banana 2, Seedream V4, Grok Imagine 2, Kling 3.0, Kling O3, Seedance 2.5, MiniMax H3, Wan 3.0, Gemini Omni 1.1, Veo 3 — más `kie run <cualquier-modelo>` | Más amplia: ~30 herramientas incluyendo audio (Suno, ElevenLabs), Midjourney, upscalers |
| Tests | 58, sin red (fetch mockeado), en Node 20 y 22 en CI | Suites de Jest por paquete |

`kie-cli-mcp` es un proyecto sólido y la opción correcta si necesitas un **servidor MCP** o su
lista más amplia de modelos. `kie` es la opción correcta si lo que te importa es **no filtrarle
una key de pago a un agente** y saber, antes de cada request, cuánto puede costar como máximo.

## Cómo funciona

1. **La key en el llavero.** `kie key set` la guarda en el Keychain de macOS, DPAPI de Windows o
   Secret Service de Linux (archivo `0600` como respaldo). Los agentes nunca la ven; toda la salida pasa por un redactor.
2. **Guardia de gasto delante de cada request.** Los modelos con precio verificado se comparan
   con `maxCreditsPerTask`; el resto exige un `--max-credits` explícito — el agente tiene que
   decir en voz alta cuánto acepta gastar. Un ledger local lleva el costo real por día.
3. **Polling, no callbacks.** La CLI nunca envía `callBackUrl`; nada de tus generaciones se
   empuja a terceros.
4. **Archivos, no enlaces.** Los resultados se descargan de inmediato; el agente recibe una ruta.
5. **Un skill de agente, no un servidor.** `kie skill install` deja `kie-media` en
   `~/.claude/skills`, `~/.agents/skills`, `~/.cursor/skills` y `~/.gemini/skills`. Después
   solo pides: *"genera una imagen hero 16:9 de una cafetería isométrica"*.
6. **Las apps de escritorio usan un servidor MCP.** Su sandbox no llega a tu llavero ni a KIE, así
   que `kie mcp install` registra `kie mcp` (stdio) en Claude Desktop, Codex y Cursor: la app lo
   lanza en tu máquina y muestra la imagen generada directamente en el chat.

Referencia completa: **[kiecli.com/es/docs](https://kiecli.com/es/docs)** · README del paquete (en inglés): [`kie/README.md`](kie/README.md).

## Estructura del repositorio

- [`kie/`](kie/) — la CLI (TypeScript, cero dependencias en runtime) y sus tests.
- [`skills/kie-media/`](skills/kie-media/) — el skill de agente (`kie skill install`, o `npx skills add julio-daza/kie-cli`).
- [`docs/assets/`](docs/assets/) — logo y capturas usadas por los READMEs.
- Sitio web: [julio-daza/kie-landing](https://github.com/julio-daza/kie-landing) → [kiecli.com](https://kiecli.com/es/)

Ver [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) y [CHANGELOG.md](CHANGELOG.md).

## Aviso

Este es un proyecto independiente de la comunidad. **No está afiliado, respaldado ni soportado
por KIE.ai**. "KIE" y el logo de KIE son marcas de su respectivo propietario y se usan aquí solo
para identificar el servicio con el que habla la herramienta. Los datos comparativos de otros
proyectos se tomaron de sus repositorios públicos el 2026-08-22; abre un issue si quedaron
desactualizados.

**Divulgación de afiliado:** el enlace "Regístrate en Kie" de arriba es un enlace de referido. Si creas una cuenta a través de él, este proyecto puede recibir una comisión — sin costo
extra para ti. Los precios y descuentos citados provienen de [kie.ai](https://kie.ai) y pueden cambiar.

## Licencia

MIT — ver [LICENSE](LICENSE).

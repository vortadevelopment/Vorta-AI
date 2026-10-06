# Vorta-AI — Arquitectura

Asistente de IA que se construye **una vez** y se instala en los 8 ERPs legacy
de VORTA (todos React + TypeScript + Supabase). El sistema piloto es **ACM**
(Abastecedora de Carnes Magaña).

> Las decisiones marcadas como **fijas** fueron definidas por el dueño del
> proyecto y no se cambian sin consultarlo.

---

## 1. Principios

1. **Un solo código, N sistemas.** Lo único que varía entre ERPs es un archivo
   de configuración y las credenciales públicas de su Supabase.
2. **El backend no conoce el esquema de nadie.** Las tools solo llaman funciones
   RPC estándar (`ai_ventas_periodo`, `ai_buscar_venta`, …). Si un ERP cambia
   sus tablas, se ajusta su RPC, no este repo.
3. **Los permisos los decide la base, no el asistente.** Toda lectura viaja con
   el JWT del usuario para que RLS aplique. **Nunca** se usa la service role key
   para leer datos del cliente.
4. **Nómina y empleados están fuera de alcance** en todos los sistemas, por
   diseño: no hay RPC que los exponga ni tool que los pida.
5. **El UI es idéntico en los 8.** Mismos tokens de marca, mismo
   comportamiento, mismo responsive.

---

## 2. Estructura del monorepo

pnpm workspaces. Tres paquetes, sin build tool extra (no hay Turbo/Nx: con tres
paquetes los scripts de pnpm bastan).

```
Vorta-AI/
├── packages/
│   ├── contracts/            @vorta/ai-contracts — protocolo compartido
│   └── ui/                   @vorta/ai-assistant — componente React del chat
├── apps/
│   └── api/                  @vorta/api — backend en Vercel
└── docs/                     contrato de RPCs y guías de implantación
```

### `packages/contracts` — `@vorta/ai-contracts`

Fuente única de verdad del protocolo entre UI y API: forma de los mensajes, de
los bloques enriquecidos (tabla, gráfica, archivo) y de los eventos SSE. Solo
tipos, cero runtime. Existe para que el UI y la API no se desincronicen cuando
el protocolo evolucione.

### `packages/ui` — `@vorta/ai-assistant`

Componente React: la pastilla del sidebar y el panel de chat. `react` y
`react-dom` son `peerDependencies` — el paquete usa la copia del ERP anfitrión,
que es indispensable con 8 sistemas en versiones distintas de React. Se publica
en ESM con los tipos generados y una hoja `styles.css` aparte.

### `apps/api` — `@vorta/api`

Backend en Vercel. Recibe la conversación, llama a Claude con tool use, ejecuta
las tools contra el Supabase del sistema y responde en streaming por SSE.

---

## 3. Decisión: Hono (no Next route handlers)

`apps/api` es **solo API**: no hay una sola pantalla. Next traería App Router,
build de React y convenciones de páginas para cero UI.

| Criterio | Hono | Next route handlers |
|---|---|---|
| Streaming SSE | `Request`/`Response` nativos, sin capas | funciona, con más abstracción encima |
| Middleware (auth, tenant, rate limit) | uno solo, aplicado a todas las rutas | se repite por handler |
| Portabilidad | mismo código en Node, Edge, Cloudflare o Supabase Edge Functions | atado a Vercel/Next |
| Tests | `app.request()` en memoria, sin servidor | requiere arnés |
| Costo | hay que escribir el entry de Vercel (~8 líneas) y no hay `next dev` (se usa `vercel dev`) | `next dev` listo |

Next solo ganaría si la API viviera en el mismo deploy que el frontend; no es el
caso, los 8 ERPs son React + Vite y la consumen por HTTP.

---

## 4. Flujo de una pregunta

```
Usuario (ERP)
  │  "¿Cuánto vendimos esta semana?"
  ▼
@vorta/ai-assistant ──POST /chat────────────────────────────────┐
  Authorization: Bearer <JWT de Supabase del usuario>           │
  X-Vorta-System: acm                                           │
  { conversationId, messages }                                   │
                                                                ▼
                                                      apps/api (Hono)
                                          1. valida el JWT y resuelve el sistema
                                          2. arma el system prompt desde la config
                                          3. llama a Claude con el catálogo de tools
                                                                │
                                   ┌────────────tool_use────────┘
                                   ▼
                      Supabase del sistema (ACM)
                      rpc('ai_ventas_periodo', {...})
                      con anonKey + el JWT del usuario → RLS decide
                                   │
                                   └──tool_result──► Claude ──texto + bloques──┐
                                                                               ▼
                                                              SSE de vuelta al UI
                                               start · text_delta · tool_start ·
                                               tool_end · block · done
```

Puntos clave:

- El **tenant se resuelve exclusivamente del header `X-Vorta-System`**. Un solo
  middleware, todas las rutas, incluida `GET /suggestions` que no tiene body. El
  body **no lleva** campo `system`: hay una sola fuente de verdad del tenant, sin
  posibilidad de conflicto. Slug desconocido → `400 unknown_system`.
- El **JWT se valida contra el Supabase del sistema indicado en el header**, no
  contra un emisor genérico: el middleware construye el cliente con la config de
  ese tenant y resuelve el usuario con ese token. Si el token no es válido para
  ese proyecto —vencido, malformado o emitido por otro Supabase— la respuesta es
  `401 unauthorized` y no se llama a Claude. Esto cierra el cruce entre sistemas:
  un token válido de otro ERP no sirve aquí.
- El **system prompt se arma en el backend**, nunca viaja en el body. Así el
  navegador no puede reescribir las reglas duras — entre ellas la exclusión de
  nómina.
- La API es **stateless respecto al historial**: el UI manda la conversación
  completa en cada turno. La persistencia llega en la Fase 5.

---

## 5. Protocolo

Definido en `packages/contracts/src/protocol.ts`. Resumen:

### `POST /chat`

```http
POST /chat
Authorization: Bearer <access_token de Supabase>
X-Vorta-System: acm
Content-Type: application/json

{ "conversationId": "…", "messages": [ … ] }
```

Respuesta `text/event-stream`. Cada evento es `event: <type>` + `data: <JSON>`:

| Evento | Cuándo | Para qué sirve en el UI |
|---|---|---|
| `start` | primero, siempre | fija `conversationId` y `messageId` |
| `text_delta` | mientras el modelo escribe | pintar texto en streaming |
| `tool_start` | antes de ejecutar una RPC | mostrar "Consultando ventas…" con el `label` ya redactado |
| `tool_end` | al terminar la RPC | quitar el indicador, o mostrar el fallo |
| `block` | al tener una tabla/gráfica/archivo completo | renderizar la tarjeta dentro de la burbuja |
| `done` | último evento en caso de éxito | cerrar la burbuja, habilitar el input |
| `error` | error terminal | mensaje al usuario; el stream se cierra |

El UI nunca ve el `name` crudo de una tool: la API manda un `label` en español.
Los bloques enriquecidos se emiten **completos** (no en streaming) — una tabla a
medio llegar no se puede renderizar sin parpadeo.

### `GET /suggestions`

Devuelve `{ businessName, suggestions }` desde la config del sistema, para el
estado vacío del chat. Sin esto el UI tendría que hardcodear las sugerencias por
ERP.

### `GET /health`

Chequeo de despliegue. No toca Claude ni Supabase.

---

## 6. Seguridad

| Riesgo | Mitigación |
|---|---|
| El asistente ve más de lo que el usuario puede ver | Toda lectura va con el JWT del usuario sobre la anon key → **RLS decide**. La service role key no se usa para leer datos del cliente. |
| El cliente reescribe las reglas del asistente | El system prompt se arma en el backend; el body solo trae la conversación. |
| Fuga de datos entre sistemas | El cliente de Supabase se construye **por petición** a partir de la config del tenant del header, y el JWT se valida contra *ese* proyecto: un token de otro ERP da `401`. No hay cliente global compartido. |
| Nómina y datos de empleados | Fuera de alcance por diseño: no hay RPC que los exponga. Además el system prompt instruye declinarlo y el UI muestra un mensaje claro (`out_of_scope`). |
| La API key de Anthropic en el navegador | Nunca sale del servidor. El UI solo habla con `apps/api`. |
| Abuso / costo | CORS restringido a los dominios de los ERPs (`VORTA_ALLOWED_ORIGINS`) y rate limit por usuario en el middleware. |
| Secretos en el repo | `.gitignore` excluye `.env*` salvo `.env.example`. Las keys viven en variables de entorno de Vercel. |
| Inyección de prompt vía datos | Los resultados de las RPCs entran como `tool_result`, nunca como instrucciones; el system prompt lo dice explícitamente. |

---

## 7. Capa de datos: RPCs estándar

El backend **solo** llama funciones `ai_*` en el Supabase de cada sistema. Cada
RPC es `security invoker` (hereda el `auth.uid()` del llamador) y por tanto
respeta RLS; devuelve JSON con una forma fija que la API traduce a bloques.

Catálogo inicial previsto (se cierra en la Fase 1, ver `docs/rpc-contract.md`):

| RPC | Para qué |
|---|---|
| `ai_ventas_periodo` | ventas agregadas por rango y granularidad |
| `ai_buscar_venta` | una venta por folio, cliente o fecha |
| `ai_top_clientes` | ranking de clientes por importe |
| `ai_top_productos` | ranking de productos por importe o volumen |
| `ai_inventario_estado` | existencias y mínimos |
| `ai_cuentas_por_cobrar` | saldos y antigüedad |

Reglas del contrato:

- Mismo nombre, mismos parámetros y misma forma de respuesta en los 8 sistemas.
- Cada RPC impone su propio límite de filas y reporta cuántas omitió.
- Un ERP sin cierto módulo simplemente no declara esa RPC en `enabledTools` y la
  tool no se le ofrece al modelo.
- **Ninguna RPC expone nómina, sueldos ni datos de empleados.**

---

## 8. Integración con Claude

- **Modelo: `claude-sonnet-5-5`** (fijo). SDK oficial `@anthropic-ai/sdk`.
- **Streaming siempre.** `client.beta.messages.toolRunner({ …, stream: true })`
  conduce el ciclo petición → ejecutar tool → repetir; el handler traduce los
  eventos del stream a los eventos SSE de la tabla de arriba.
- **`output_config.effort`:** en Sonnet 5.5 el default es `high` y los niveles
  están recalibrados. Se arranca en `medium` (consultas con tool use) y se baja
  a `low` para preguntas conversacionales; se mide antes de fijarlo.
- **Thinking:** adaptativo (el default). En este modelo `thinking: {type:
  "disabled"}` devuelve 400; si alguna ruta necesitara apagarlo, la forma válida
  es `{type: "between_tools"}` con effort `high` o menor.
- **Historial append-only.** Sonnet 5.5 aplica *preserved thinking*: los bloques
  de razonamiento quedan ligados a la conversación que los produjo. El historial
  nunca se reescribe ni se recorta por el medio; se añade al final y los bloques
  del asistente se reenvían sin modificar. Esto condiciona la Fase 5.
- **`tool_choice` forzado no existe** en este modelo (`any`/`tool` → 400). Se usa
  `auto` + `strict: true` en cada tool para que los argumentos validen contra el
  esquema.
- **Tool use en paralelo:** si un turno trae varios `tool_use`, se ejecutan
  concurrentemente y **todos** los `tool_result` vuelven en un único mensaje de
  usuario.
- **`eager_input_streaming: true`** en las tools, porque la petición es
  streaming; a cambio el backend valida cada input parseado contra su esquema
  antes de ejecutarlo (un input truncado puede pasar la validación de tipos).
- **`stop_reason: "refusal"`** se maneja explícitamente: se revisa antes de leer
  el contenido y antes de ejecutar las tools de ese turno, y se traduce a un
  mensaje claro para el usuario.
- **Prompt caching:** el orden de render es `tools` → `system` → `messages`. El
  system prompt y el catálogo de tools son estables por sistema y se cachean;
  nada volátil (fechas, ids de petición) entra antes del último breakpoint.

---

## 9. Configuración por sistema

Un archivo por ERP en `apps/api/src/systems/<slug>.ts`, con la forma de
`SystemConfig` (`apps/api/src/systems/types.ts`):

```ts
export const acm: SystemConfig = {
  slug: 'acm',
  businessName: 'Abastecedora de Carnes Magaña',
  industry: 'Distribución y venta mayorista de carnes',
  timeZone: 'America/Monterrey',
  currency: 'MXN',
  supabase: {
    url: process.env['ACM_SUPABASE_URL'] ?? '',
    anonKey: process.env['ACM_SUPABASE_ANON_KEY'] ?? '',
  },
  suggestions: [ /* 4–6 preguntas en el lenguaje del negocio */ ],
  enabledTools: [ /* subconjunto del catálogo ai_* */ ],
};
```

Las URLs y keys **siempre** por variable de entorno, con el prefijo del slug en
mayúsculas (`ACM_SUPABASE_URL`). Dar de alta un sistema nuevo = un archivo + dos
variables en Vercel + las RPCs `ai_*` en su Supabase.

---

## 10. Diseño del UI (obligatorio)

### Marca

| Token | Valor |
|---|---|
| Tipografía | Plus Jakarta Sans |
| Fondo | blanco `#ffffff` |
| Negro | `#050508` |
| Azul | `#4F8EF7` |
| Morado | `#7C5CFC` |
| Degradado del orbe | azul → morado, 135° |

Viven en `packages/ui/src/styles/tokens.css`, prefijados `--vai-` y acotados a
`.vai-root` para no chocar con el CSS global de cada ERP.

### Botón del sidebar

Pastilla fija **arriba del menú**, con un orbe de degradado azul→morado y la
etiqueta **"IA"**. Estados: reposo, hover, activo y "hay respuesta nueva".

### Panel de chat

- Burbujas limpias: usuario con fondo tenue, asistente sobre blanco, sin
  bordes duros.
- **Streaming** del texto a medida que llega.
- **Tablas y gráficas dentro del mensaje**, no en un panel aparte.
- **Archivos como tarjetas descargables** (nombre, tipo, tamaño, botón de
  descarga) apuntando a URLs firmadas de vida corta.
- **Estado vacío** con el nombre del negocio y 4–6 sugerencias clicables que
  vienen de `GET /suggestions`.
- Indicador de herramienta en curso con texto en español ("Consultando ventas de
  septiembre…").

### Responsive

| Breakpoint | Comportamiento |
|---|---|
| Escritorio (> 1024px) | panel lateral de 420px, el contenido del ERP sigue visible |
| Tablet (641–1024px) | panel de `min(480px, 70vw)` sobre un velo |
| Celular (≤ 640px) | panel a pantalla completa, input anclado abajo con safe-area |

Se respeta `prefers-reduced-motion`.

---

## 11. Plan por fases

| Fase | Alcance | Entregable |
|---|---|---|
| **0** | Scaffold del monorepo, tokens de marca, contrato de tipos, este documento | ✅ este paso |
| **1** | Cerrar el contrato de RPCs `ai_*`: firmas, forma de respuesta, límites, políticas de RLS. Implementarlas en el Supabase de ACM | `docs/rpc-contract.md` + SQL aplicado en ACM |
| **2** | Backend: middleware de auth y tenant, cliente de Supabase por petición, catálogo de tools, loop de tool use con Claude, SSE, CORS, rate limit | `POST /chat` verificable con `curl` |
| **3** | UI: botón del sidebar, panel, burbujas, streaming, estado vacío, responsive, playground de desarrollo | `@vorta/ai-assistant` v0.1 |
| **4** | Render de bloques enriquecidos: tablas, gráficas y tarjetas de archivo | v0.2 |
| **5** | Persistencia de conversaciones (`conversationId`), historial e historial largo con historial append-only | v0.3 |
| **6** | Integración piloto en ACM, QA en escritorio/tablet/celular, observabilidad y manejo de errores | piloto en producción |
| **7** | Rollout: un `systems/<slug>.ts` + sus RPCs por cada uno de los 7 ERPs restantes | 8/8 |

---

## 12. Fuera de alcance

- **Nómina, sueldos y datos de empleados**, en todos los sistemas y todas las
  fases.
- Escrituras: el asistente **lee**. No crea ni modifica registros del ERP.
- Autenticación propia: la identidad la da el Supabase Auth de cada ERP.
- Reemplazar pantallas del ERP. El asistente responde preguntas, no sustituye
  módulos.

# Vorta-AI

Asistente de IA para los 8 ERPs de VORTA. Se construye una vez y se reutiliza en
todos. Sistema piloto: **ACM** (Abastecedora de Carnes Magaña).

- Arquitectura y plan por fases → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Contrato de RPCs → [`docs/rpc-contract.md`](./docs/rpc-contract.md)

## Paquetes

| Paquete | Qué es |
|---|---|
| `packages/contracts` → `@vorta/ai-contracts` | protocolo compartido (tipos de mensajes y eventos SSE) |
| `packages/ui` → `@vorta/ai-assistant` | componente React: botón del sidebar + panel de chat |
| `apps/api` → `@vorta/api` | backend en Vercel: Hono + Claude con tool use + SSE |

## Requisitos

- Node 20+ (`.nvmrc`)
- pnpm 9+ — `npm install -g pnpm` o `corepack enable`

## Arranque

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # llenar las keys; .env* está en .gitignore
pnpm build                               # compila contracts y ui
pnpm typecheck
```

| Script | Qué hace |
|---|---|
| `pnpm build` | compila `@vorta/ai-contracts` y `@vorta/ai-assistant` |
| `pnpm dev:api` | `vercel dev` en `apps/api` |
| `pnpm dev:ui` | playground de desarrollo del componente (Fase 3) |
| `pnpm typecheck` | `tsc --noEmit` en todos los paquetes |

## Estado

Fase 0 completa: scaffold, tokens de marca, contrato de tipos y documentación de
arquitectura. El chat y el backend se implementan en las fases 2 y 3.

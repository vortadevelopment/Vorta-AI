import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '../supabase/rpc.js';
import type { SystemConfig } from '../systems/types.js';
import { TOOL_CATALOG } from './catalog.js';

/**
 * Lo que el asistente puede hacer en nombre de ESTE usuario, resuelto antes de
 * la primera llamada a Claude.
 *
 * La regla de oro: a Claude solo se le ofrecen las tools que el usuario puede
 * usar. Que la RPC rechace al usuario con 42501 es la red de seguridad, no el
 * mecanismo: si la tool no está en el catálogo, el modelo no puede ni intentar
 * y no gasta un turno para que le digan que no.
 */
export interface Capabilities {
  tools: Anthropic.Beta.BetaTool[];
  /** Roles del usuario según la base ('ADMIN', 'VENTAS', …). Puede venir vacío. */
  roles: string[];
  /** Nombres de RPCs que el usuario NO puede usar; entran al prompt como contexto. */
  denied: string[];
}

export type CapabilitiesResult =
  | { ok: true; capabilities: Capabilities }
  | { ok: false; message: string };

interface PermisosFila {
  funcion?: unknown;
  puede?: unknown;
}

/**
 * Llama `ai_mis_permisos()` con el JWT del usuario y cruza el resultado con el
 * catálogo del sistema.
 *
 * Falla cerrado: si la RPC no se puede leer, no se ofrece ninguna tool y el
 * chat responde con un error. Ofrecer el catálogo completo "por si acaso" sería
 * exactamente el agujero que este archivo existe para tapar.
 */
export async function resolveCapabilities(
  db: SupabaseClient,
  config: SystemConfig,
): Promise<CapabilitiesResult> {
  const result = await callRpc(db, 'ai_mis_permisos', {});

  if (!result.ok) {
    return {
      ok: false,
      message: `No se pudieron leer los permisos del usuario: ${result.message}`,
    };
  }

  const payload = result.data as { resumen?: unknown; filas?: unknown } | null;
  const filas = Array.isArray(payload?.filas) ? (payload.filas as PermisosFila[]) : [];

  if (filas.length === 0) {
    return { ok: false, message: 'ai_mis_permisos no devolvió el catálogo de funciones.' };
  }

  const permitidas = new Set<string>();
  const negadas: string[] = [];
  for (const fila of filas) {
    if (typeof fila.funcion !== 'string') continue;
    if (fila.puede === true) permitidas.add(fila.funcion);
    else negadas.push(fila.funcion);
  }

  // Doble filtro: lo que la base le permite al usuario Y lo que este sistema
  // declara. Un ERP sin cierto módulo no ofrece esa tool aunque la RPC exista.
  const habilitadas = new Set(config.enabledTools);
  const tools = TOOL_CATALOG.filter(
    (tool) => habilitadas.has(tool.name) && permitidas.has(tool.name),
  );

  const resumen = (payload?.resumen ?? {}) as { roles?: unknown };
  const roles = Array.isArray(resumen.roles)
    ? resumen.roles.filter((role): role is string => typeof role === 'string')
    : [];

  return {
    ok: true,
    capabilities: {
      tools,
      roles,
      denied: negadas.filter((name) => habilitadas.has(name)),
    },
  };
}

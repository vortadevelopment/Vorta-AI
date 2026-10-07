import type { SupabaseClient } from '@supabase/supabase-js';

/** Resultado normalizado de una RPC `ai_*`. */
export type RpcResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: RpcErrorKind; message: string };

export type RpcErrorKind =
  /** La RPC levantó `no_autorizado` (42501): el gate de la función lo rechazó. */
  | 'forbidden'
  /** La RPC levantó una validación de argumentos (22023). Es corregible. */
  | 'invalid_args'
  /** Red, timeout, función inexistente, o cualquier otra falla del upstream. */
  | 'upstream';

/**
 * Códigos que Postgres usa en las RPCs del catálogo. Están declarados en el SQL
 * con `using errcode = ...`, no son genéricos de PostgREST.
 */
const FORBIDDEN = '42501';
const INVALID_ARGS = '22023';

/**
 * Quita las claves nulas o indefinidas del objeto de argumentos.
 *
 * Importa: los parámetros de las RPCs tienen `default null` y la función
 * interpreta ese null como "sin filtro" o cae a un default calculado
 * (`p_hasta` → hoy, `p_limite` → 50). Mandar `{ p_limite: null }` explícito
 * funciona igual, pero mandar la clave ausente es lo que deja que Postgres
 * aplique el default de la firma. Como el esquema que ve Claude declara los
 * opcionales como nullable, aquí es donde ese null se vuelve "omitido".
 */
function compact(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Llama una RPC `ai_*` y clasifica el error. No lanza: el loop de tool use
 * necesita convertir cualquier falla en un `tool_result` para que el modelo la
 * explique, no en una excepción que tire el stream.
 */
export async function callRpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  try {
    const { data, error } = await db.rpc(name, compact(args));

    if (error !== null) {
      if (error.code === FORBIDDEN) {
        return { ok: false, kind: 'forbidden', message: error.message };
      }
      if (error.code === INVALID_ARGS) {
        return { ok: false, kind: 'invalid_args', message: error.message };
      }
      return {
        ok: false,
        kind: 'upstream',
        message: error.message,
      };
    }

    return { ok: true, data };
  } catch (cause) {
    return {
      ok: false,
      kind: 'upstream',
      message: cause instanceof Error ? cause.message : 'Error al consultar la base de datos',
    };
  }
}

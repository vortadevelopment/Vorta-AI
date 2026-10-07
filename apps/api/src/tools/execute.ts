import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '../supabase/rpc.js';
import { TOOL_SCHEMAS } from './schemas.js';

export interface ToolOutcome {
  /** El bloque que se le devuelve a Claude en el siguiente mensaje de usuario. */
  result: Anthropic.Beta.BetaToolResultBlockParam;
  /** Para el evento `tool_end` del SSE. */
  ok: boolean;
  /** Mensaje legible cuando falló. Nunca trae detalles internos. */
  message?: string;
}

/**
 * Respuestas que el modelo lee cuando algo sale mal. Están redactadas como
 * instrucciones porque es lo único que evita que el modelo rellene el hueco con
 * una cifra inventada: decirle qué pasó no basta, hay que decirle qué hacer.
 */
const MENSAJES = {
  forbidden: [
    'PERMISO DENEGADO: la base de datos rechazó esta consulta porque el usuario no tiene',
    'el rol o el permiso necesario para ver estos datos. No hay datos que reportar.',
    'Dile al usuario, en una frase, que no tiene permiso para consultar esa información y',
    'que la pida a quien administre el sistema. NO estimes, NO aproximes, NO uses otra tool',
    'para rodear la restricción y NO des ninguna cifra.',
  ].join(' '),

  invalidInput: [
    'ARGUMENTOS INVÁLIDOS: los parámetros que mandaste no cumplen el esquema de la tool.',
    'Revísalos y vuelve a llamarla con valores válidos. Si no sabes qué valor usar, pregúntale',
    'al usuario en lugar de adivinar.',
  ].join(' '),

  upstream: [
    'ERROR DE LA BASE DE DATOS: la consulta no se pudo completar, así que no hay datos.',
    'Dile al usuario que hubo un problema al consultar el sistema y que lo intente de nuevo.',
    'NO inventes ni estimes cifras.',
  ].join(' '),
} as const;

function block(
  toolUseId: string,
  content: string,
  isError: boolean,
): Anthropic.Beta.BetaToolResultBlockParam {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    ...(isError ? { is_error: true as const } : {}),
  };
}

/**
 * Valida el input, llama la RPC con el JWT del usuario y envuelve el resultado.
 *
 * No lanza nunca: toda falla se convierte en un `tool_result` con
 * `is_error: true`, porque el modelo necesita poder explicarle al usuario qué
 * pasó. Una excepción aquí tiraría el stream a media respuesta.
 */
export async function executeTool(
  db: SupabaseClient,
  toolUse: Anthropic.Beta.BetaToolUseBlock,
): Promise<ToolOutcome> {
  const schema = TOOL_SCHEMAS[toolUse.name];
  if (schema === undefined) {
    return {
      ok: false,
      message: 'Esa consulta no está disponible.',
      result: block(
        toolUse.id,
        `TOOL DESCONOCIDA: "${toolUse.name}" no existe. Usa solo las tools declaradas.`,
        true,
      ),
    };
  }

  // Con `eager_input_streaming` la API ya no valida el input y el parser
  // tolerante del SDK puede entregar un objeto truncado que parece válido.
  // Nada se ejecuta sin pasar por aquí.
  const parsed = schema.input.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'No entendí los parámetros de la consulta.',
      result: block(
        toolUse.id,
        `${MENSAJES.invalidInput}\n\nDetalle: ${JSON.stringify(parsed.error.issues)}`,
        true,
      ),
    };
  }

  const rpc = await callRpc(db, toolUse.name, parsed.data);

  if (!rpc.ok) {
    switch (rpc.kind) {
      case 'forbidden':
        return {
          ok: false,
          message: 'No tienes permiso para consultar esa información.',
          result: block(toolUse.id, MENSAJES.forbidden, true),
        };
      case 'invalid_args':
        // La RPC trae su propio mensaje útil ('sin_criterios: indica al menos
        // monto, fecha, cliente, producto o folio'). Pasárselo tal cual es lo
        // que le permite corregir en el siguiente turno.
        return {
          ok: false,
          message: 'La consulta necesita más datos.',
          result: block(
            toolUse.id,
            `ARGUMENTOS RECHAZADOS POR LA BASE: ${rpc.message}\n\nCorrige la llamada; si falta información, pregúntale al usuario.`,
            true,
          ),
        };
      case 'upstream':
        return {
          ok: false,
          message: 'Hubo un problema al consultar el sistema.',
          result: block(toolUse.id, MENSAJES.upstream, true),
        };
    }
  }

  return {
    ok: true,
    result: block(toolUse.id, JSON.stringify(rpc.data), false),
  };
}

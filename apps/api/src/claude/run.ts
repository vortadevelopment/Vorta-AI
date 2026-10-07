import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StopReason } from '@vorta/ai-contracts';
import type { ChatRequestMessage } from '../chat-request.js';
import type { ChatStream } from '../sse.js';
import type { SystemConfig } from '../systems/types.js';
import { executeTool } from '../tools/execute.js';
import { labelFor } from '../tools/labels.js';
import type { Capabilities } from '../tools/permissions.js';
import { anthropic } from './client.js';
import { toClaudeMessages } from './history.js';
import { buildSystemPrompt, todayInZone } from './system-prompt.js';

/** Fijo por decisión de arquitectura. */
const MODEL = 'claude-sonnet-5-5';

/**
 * Tope de iteraciones de tool use por mensaje del usuario. Una pregunta normal
 * se resuelve en 1 o 2; 8 deja margen para una comparación de varios periodos
 * sin dejar que un turno se cicle contra la base.
 */
const MAX_ITERATIONS = 8;

/**
 * Si la API no pudo parsear el input de una tool, el turno se reintenta. El tope
 * es sobre fallas CONSECUTIVAS del mismo turno, no sobre el total de la
 * conversación.
 */
const MAX_JSON_RETRIES = 2;

const MAX_TOKENS = 16_000;

/**
 * Fallback de servidor: si un clasificador de seguridad declina la petición, la
 * API la reintenta sola en otro modelo dentro de la misma llamada. Una pregunta
 * sobre ventas o inventario que acabe en `refusal` es casi con certeza un falso
 * positivo, y sin esto el stream simplemente se cortaría.
 */
const BETAS: Anthropic.AnthropicBeta[] = ['server-side-fallback-2026-07-01'];

export interface RunOptions {
  system: SystemConfig;
  capabilities: Capabilities;
  db: SupabaseClient;
  history: ChatRequestMessage[];
  sse: ChatStream;
}

type Outcome = { stopReason: StopReason } | { errorMessage: string };

/**
 * Conduce el ciclo petición → ejecutar tools → repetir, traduciendo el stream de
 * Claude a los eventos SSE del contrato.
 *
 * Se maneja a mano en vez de con `toolRunner` porque hacen falta tres cosas que
 * el runner no expone: emitir `tool_start` con su label antes de ejecutar la
 * RPC, marcar `is_error: true` en el `tool_result` de un permiso denegado con un
 * mensaje propio, y cortar en el tope de iteraciones con una respuesta útil en
 * lugar de a la mitad.
 *
 * El historial es append-only: el contenido de cada turno del asistente se
 * reenvía SIN modificar, incluidos los bloques de razonamiento, porque en este
 * modelo quedan ligados a la conversación que los produjo.
 */
export async function runChat(options: RunOptions): Promise<Outcome> {
  const { system, capabilities, db, history, sse } = options;
  const client = anthropic();

  const messages = toClaudeMessages(history);
  if (messages.length === 0) {
    return { errorMessage: 'No hay ningún mensaje que contestar.' };
  }

  const systemPrompt = buildSystemPrompt(system, {
    roles: capabilities.roles,
    today: todayInZone(system.timeZone),
  });

  let jsonRetries = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const lastIteration = iteration === MAX_ITERATIONS - 1;

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await streamTurn(client, {
        system: systemPrompt,
        messages,
        tools: capabilities.tools,
        // En la última iteración se le prohíbe llamar tools para que cierre con
        // lo que ya tiene, en lugar de pedir una consulta más que no vamos a
        // correr. Se bloquea con `tool_choice: none` y NO quitando `tools`: el
        // catálogo tiene que ser idéntico en todas las llamadas de la
        // conversación para no romper el prefijo cacheado.
        allowTools: !lastIteration,
        sse,
      });
      jsonRetries = 0;
    } catch (cause) {
      if (cause instanceof Anthropic.APIError) throw cause;
      if (jsonRetries >= MAX_JSON_RETRIES) {
        return {
          errorMessage: 'No pude completar la consulta. Vuelve a intentarlo.',
        };
      }
      jsonRetries += 1;
      iteration -= 1; // el turno no se consumió: no contó como iteración
      continue;
    }

    // Un refusal puede cortar un `tool_use` a medio input, así que se revisa
    // ANTES de leer el contenido y antes de ejecutar nada de este turno.
    if (message.stop_reason === 'refusal') {
      return { stopReason: 'refusal' };
    }

    const toolUses = message.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
    );

    if (message.stop_reason === 'max_tokens') {
      // Con tool_use, el input pudo truncarse y seguir pareciendo válido: no se
      // ejecuta. Sin tool_use es solo una respuesta cortada, y eso sí se reporta.
      return toolUses.length > 0
        ? { errorMessage: 'La respuesta se cortó por longitud. Intenta una pregunta más específica.' }
        : { stopReason: 'max_tokens' };
    }

    // El servidor pausó el turno por su cuenta: se reenvía tal cual para seguir.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }

    if (toolUses.length === 0) {
      return { stopReason: 'end_turn' };
    }

    messages.push({ role: 'assistant', content: message.content });

    for (const toolUse of toolUses) {
      await sse.toolStart(toolUse.id, toolUse.name, labelFor(toolUse.name, toolUse.input));
    }

    // Varias tools en un turno se ejecutan concurrentemente, y TODOS los
    // tool_result vuelven en un solo mensaje de usuario: partirlos en varios
    // mensajes le enseña al modelo a dejar de pedir tools en paralelo.
    const outcomes = await Promise.all(toolUses.map((toolUse) => executeTool(db, toolUse)));

    for (const [index, outcome] of outcomes.entries()) {
      const toolUse = toolUses[index];
      if (toolUse === undefined) continue;
      await sse.toolEnd(toolUse.id, outcome.ok, outcome.message);
    }

    messages.push({ role: 'user', content: outcomes.map((outcome) => outcome.result) });
  }

  // Se agotaron las iteraciones y el último turno todavía pidió tools. No se
  // ejecutan: se cierra como fin de turno para que el UI muestre lo que alcanzó
  // a escribirse.
  return { stopReason: 'end_turn' };
}

interface TurnOptions {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  allowTools: boolean;
  sse: ChatStream;
}

/**
 * Un turno: abre el stream, va emitiendo `text_delta` en orden y devuelve el
 * mensaje completo para poder inspeccionar `stop_reason` y los `tool_use`.
 *
 * Se itera el stream a mano en vez de usar `stream.on('text')` porque escribir
 * en el SSE es asíncrono: con el callback los deltas podrían salir desordenados.
 */
async function streamTurn(
  client: Anthropic,
  options: TurnOptions,
): Promise<Anthropic.Beta.BetaMessage> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: BETAS,
    fallbacks: 'default',
    // El default en este modelo es `high`; `medium` es suficiente para consultas
    // con tool use y cuesta bastante menos. Thinking queda adaptativo (el
    // default): en este modelo no se puede apagar con `disabled`.
    output_config: { effort: 'medium' },
    system: options.system,
    messages: options.messages,
    tools: options.tools,
    // `auto` es el default y es el único modo utilizable: en este modelo forzar
    // una tool (`any` o `tool`) responde 400. La garantía de que los argumentos
    // validen la da `strict: true` en cada tool, no el tool_choice.
    ...(options.allowTools ? {} : { tool_choice: { type: 'none' as const } }),
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      await options.sse.textDelta(event.delta.text);
    }
  }

  return stream.finalMessage();
}

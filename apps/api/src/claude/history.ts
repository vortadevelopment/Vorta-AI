import type Anthropic from '@anthropic-ai/sdk';
import type { ChatRequestBlock, ChatRequestMessage } from '../chat-request.js';

/**
 * Traduce el historial que manda el UI al formato de la API de Claude.
 *
 * La API es stateless respecto al historial (el UI reenvía la conversación
 * completa en cada turno, ver ARCHITECTURE §4), y un `ChatMessage` solo
 * transporta bloques de presentación: texto, tabla, gráfica y archivo. Los
 * bloques de razonamiento y los `tool_use` de turnos anteriores no viajan por
 * ahí, así que no se reconstruyen aquí: se perderían igual. Dentro de UNA
 * llamada a /chat el loop sí es append-only y reenvía `message.content` sin
 * tocarlo.
 *
 * Las tablas y gráficas se resumen como texto: lo que importa es que el modelo
 * recuerde de qué se habló, no volver a pintarlas.
 */
function blockToText(block: ChatRequestBlock): string | undefined {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'table':
      return `[${block.title ?? 'tabla'}: ${block.rows.length} fila(s), columnas ${block.columns
        .map((column) => column.label)
        .join(', ')}]`;
    case 'chart':
      return `[gráfica ${block.kind}${block.title === undefined ? '' : `: ${block.title}`}]`;
    case 'file':
      return `[archivo: ${block.name}]`;
  }
}

function toText(blocks: ChatRequestBlock[]): string {
  return blocks
    .map(blockToText)
    .filter((text): text is string => text !== undefined && text.trim() !== '')
    .join('\n\n');
}

/**
 * Convierte el historial y descarta los mensajes que quedarían vacíos: la API
 * rechaza un mensaje sin contenido, y un turno vacío no aporta contexto.
 */
export function toClaudeMessages(
  messages: ChatRequestMessage[],
): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const message of messages) {
    const text = toText(message.blocks);
    if (text === '') continue;
    out.push({ role: message.role, content: text });
  }
  return out;
}

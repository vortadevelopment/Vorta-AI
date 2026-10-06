import type { AssistantBlock, ChatMessage } from './message.js';

/**
 * Header que identifica el sistema (tenant). Es la ÚNICA fuente de verdad del
 * tenant: va en toda petición a la API y el body no lo repite.
 *
 * El backend valida el JWT contra el Supabase del sistema indicado aquí; un
 * token que no sea válido para ese proyecto responde 401.
 */
export const SYSTEM_HEADER = 'X-Vorta-System';

/**
 * Cuerpo de POST /chat. El JWT del usuario va en `Authorization: Bearer` y el
 * tenant en el header `X-Vorta-System`.
 *
 * El system prompt NO viaja en el body: se arma en el backend a partir de la
 * config del sistema.
 */
export interface ChatRequest {
  /** Id de conversación; si se omite, la API crea una y la devuelve en `start`. */
  conversationId?: string;
  /** Historial completo que el UI quiere continuar, en orden cronológico. */
  messages: ChatMessage[];
}

/* ---------------------------------------------------------------------------
 * Eventos SSE de la respuesta. Cada uno llega como:
 *   event: <type>\ndata: <JSON del payload>\n\n
 * ------------------------------------------------------------------------- */

/** Primer evento. Fija la identidad de la conversación y del mensaje. */
export interface StartEvent {
  type: 'start';
  conversationId: string;
  messageId: string;
}

/** Fragmento de texto del asistente, para pintar en streaming. */
export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
}

/**
 * La API empezó a ejecutar una tool. `label` es texto listo para mostrar
 * ("Consultando ventas de septiembre…"); el UI nunca muestra `name` crudo.
 */
export interface ToolStartEvent {
  type: 'tool_start';
  toolUseId: string;
  name: string;
  label: string;
}

export interface ToolEndEvent {
  type: 'tool_end';
  toolUseId: string;
  ok: boolean;
  /** Mensaje legible cuando `ok` es false; nunca incluye detalles internos. */
  message?: string;
}

/** Bloque enriquecido completo (tabla, gráfica o archivo) listo para renderizar. */
export interface BlockEvent {
  type: 'block';
  block: AssistantBlock;
}

export type StopReason = 'end_turn' | 'max_tokens' | 'refusal' | 'error';

/** Último evento en una respuesta exitosa. */
export interface DoneEvent {
  type: 'done';
  stopReason: StopReason;
}

/** Error terminal. Después de esto el stream se cierra. */
export interface ErrorEvent {
  type: 'error';
  code: ChatErrorCode;
  /** Texto en español, apto para mostrarle al usuario tal cual. */
  message: string;
}

export type ChatEvent =
  | StartEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | BlockEvent
  | DoneEvent
  | ErrorEvent;

export type ChatErrorCode =
  /** Falta el JWT, está vencido, o no es válido para el Supabase de ese sistema. */
  | 'unauthorized'
  /** RLS negó el acceso: el usuario no puede ver ese dato. */
  | 'forbidden'
  /** Falta el header `X-Vorta-System` o el slug no corresponde a un sistema. */
  | 'unknown_system'
  /** El tema está fuera del alcance del asistente (p. ej. nómina). */
  | 'out_of_scope'
  /** Demasiadas peticiones. */
  | 'rate_limited'
  /** Falla al llamar a Claude o a Supabase. */
  | 'upstream_error'
  /** Cualquier otra cosa. */
  | 'internal_error';

/** GET /suggestions — estado vacío del chat. */
export interface SuggestionsResponse {
  businessName: string;
  suggestions: string[];
}

import { z } from 'zod';
import type { ChatRequest } from '@vorta/ai-contracts';

/**
 * Validación del body de POST /chat contra el contrato, y la fuente del tipo que
 * usa el backend para el historial.
 *
 * Los bloques se validan completos, no laxos: `claude/history.ts` lee las
 * columnas y las filas de una tabla, y el body viene del navegador. Un bloque a
 * medias tiene que rebotar aquí, no explotar a media conversación.
 *
 * El tenant NO está en el body a propósito: va en el header `X-Vorta-System`,
 * que es la única fuente de verdad.
 */

const COLUMN_FORMAT = z.enum(['text', 'number', 'currency', 'percent', 'date']);
const CELL = z.union([z.string(), z.number(), z.null()]);

const TEXT_BLOCK = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const TABLE_BLOCK = z.object({
  type: z.literal('table'),
  title: z.string().optional(),
  columns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      format: COLUMN_FORMAT,
      align: z.enum(['left', 'right', 'center']).optional(),
    }),
  ),
  rows: z.array(z.record(z.string(), CELL)),
  footer: z.record(z.string(), CELL).optional(),
  truncatedRows: z.number().optional(),
});

const CHART_BLOCK = z.object({
  type: z.literal('chart'),
  kind: z.enum(['line', 'bar', 'area', 'donut']),
  title: z.string().optional(),
  series: z.array(
    z.object({
      label: z.string(),
      points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })),
    }),
  ),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  valueFormat: COLUMN_FORMAT.optional(),
});

const FILE_BLOCK = z.object({
  type: z.literal('file'),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().optional(),
  url: z.string(),
  expiresAt: z.string().optional(),
});

const BLOCK = z.discriminatedUnion('type', [TEXT_BLOCK, TABLE_BLOCK, CHART_BLOCK, FILE_BLOCK]);

export const CHAT_REQUEST = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant']),
        blocks: z.array(BLOCK),
        createdAt: z.string(),
      }),
    )
    .min(1)
    // Tope de turnos por petición: la API es stateless y el UI reenvía todo el
    // historial, así que esto acota el tamaño de una petición.
    .max(200),
});

/** Mensaje del historial, ya validado. */
export type ChatRequestMessage = z.infer<typeof CHAT_REQUEST>['messages'][number];

/** Bloque de un mensaje, ya validado. */
export type ChatRequestBlock = ChatRequestMessage['blocks'][number];

/**
 * Comprobación en tiempo de compilación de que el esquema ACEPTA cualquier
 * `ChatRequest` válido del contrato. Si el contrato gana un campo obligatorio o
 * cambia una forma y este esquema no se actualiza, esto deja de compilar.
 *
 * La comprobación va en este sentido a propósito: `exactOptionalPropertyTypes`
 * hace que el `T | undefined` que infiere Zod para un `.optional()` no sea
 * idéntico al `prop?: T` del contrato, y lo que importa verificar es que nada
 * válido se rechace.
 */
const _accepts: z.infer<typeof CHAT_REQUEST> = {} as ChatRequest;
void _accepts;

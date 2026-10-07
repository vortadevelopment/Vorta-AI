import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runChat } from '../claude/run.js';
import type { AppEnv } from '../middleware/types.js';
import { ChatStream } from '../sse.js';
import { resolveCapabilities } from '../tools/permissions.js';
import { CHAT_REQUEST } from '../chat-request.js';

export const chat = new Hono<AppEnv>();

chat.post('/', async (c) => {
  const parsed = CHAT_REQUEST.safeParse(await c.req.json().catch(() => null));

  // El body se valida ANTES de abrir el stream: un 400 con JSON es más útil
  // para el UI que un SSE que solo trae un evento de error.
  if (!parsed.success) {
    return c.json(
      {
        type: 'error',
        code: 'internal_error',
        message: 'La petición no tiene el formato esperado.',
      },
      400,
    );
  }

  const system = c.get('system');
  const db = c.get('db');
  const { conversationId = randomUUID(), messages } = parsed.data;
  const messageId = randomUUID();

  return streamSSE(c, async (raw) => {
    const sse = new ChatStream(raw);
    await sse.start(conversationId, messageId);

    // Los permisos se resuelven ANTES del primer token: el catálogo que ve
    // Claude depende de ellos. Si no se pueden leer, el chat corta — ofrecer
    // todas las tools "por si acaso" sería exactamente el agujero a evitar.
    const capabilities = await resolveCapabilities(db, system);
    if (!capabilities.ok) {
      console.error('[chat] permisos:', capabilities.message);
      await sse.error('upstream_error', 'No pude verificar tus permisos. Intenta de nuevo.');
      return;
    }

    try {
      const outcome = await runChat({
        system,
        capabilities: capabilities.capabilities,
        db,
        history: messages,
        sse,
      });

      if ('errorMessage' in outcome) {
        await sse.error('internal_error', outcome.errorMessage);
        return;
      }

      if (outcome.stopReason === 'refusal') {
        await sse.error(
          'out_of_scope',
          'No puedo contestar eso. Pregúntame sobre ventas, clientes, inventario o cobranza.',
        );
        return;
      }

      await sse.done(outcome.stopReason);
    } catch (cause) {
      // El detalle se queda en el log del servidor; al usuario solo le llega un
      // mensaje en español, sin internals.
      console.error('[chat] error:', cause);
      if (cause instanceof Anthropic.RateLimitError) {
        await sse.error(
          'rate_limited',
          'Hay demasiadas consultas en este momento. Intenta en un minuto.',
        );
        return;
      }
      if (cause instanceof Anthropic.APIError) {
        await sse.error('upstream_error', 'El asistente no está disponible en este momento.');
        return;
      }
      await sse.error('internal_error', 'Ocurrió un error inesperado. Intenta de nuevo.');
    }
  });
});

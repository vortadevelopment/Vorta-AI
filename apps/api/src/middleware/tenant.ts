import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { SYSTEM_HEADER } from '@vorta/ai-contracts';
import { createSystemClient } from '../supabase/client.js';
import { resolveSystem } from '../systems/index.js';
import type { AppEnv } from './types.js';

/**
 * Resuelve el tenant y autentica al usuario, en ese orden, antes de que
 * cualquier ruta corra.
 *
 * Los dos pasos importan por seguridad:
 *
 *  1. El tenant sale EXCLUSIVAMENTE del header `X-Vorta-System`. El body no
 *     lleva el sistema, así que no hay dos fuentes que puedan contradecirse.
 *
 *  2. El JWT se valida contra el Supabase DE ESE SISTEMA, no contra un emisor
 *     genérico: se construye el cliente con la config del tenant y se resuelve
 *     el usuario con ese token. Un token válido de otro ERP no sirve aquí. Si
 *     falla, la respuesta es 401 y nunca se llama a Claude.
 */
export const tenant = createMiddleware<AppEnv>(async (c, next) => {
  const system = resolveSystem(c.req.header(SYSTEM_HEADER));

  if (system === undefined) {
    throw new HTTPException(400, {
      res: jsonError(
        400,
        'unknown_system',
        `No reconozco el sistema indicado en el header ${SYSTEM_HEADER}.`,
      ),
    });
  }

  const header = c.req.header('Authorization');
  const token =
    header !== undefined && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';

  if (token === '') {
    throw new HTTPException(401, {
      res: jsonError(401, 'unauthorized', 'Falta el token de sesión. Vuelve a iniciar sesión.'),
    });
  }

  const db = createSystemClient(system, token);

  // `getUser(token)` verifica firma y vigencia contra ESTE proyecto de Supabase.
  // Es la única validación del JWT que se hace: no se decodifica a mano en
  // ningún lado.
  const { data, error } = await db.auth.getUser(token);

  if (error !== null || data.user === null) {
    throw new HTTPException(401, {
      res: jsonError(
        401,
        'unauthorized',
        'Tu sesión no es válida o ya venció. Vuelve a iniciar sesión.',
      ),
    });
  }

  c.set('system', system);
  c.set('user', data.user);
  c.set('db', db);

  await next();
});

/**
 * Error antes de abrir el SSE: se responde como JSON con el mismo `code` del
 * contrato, para que el UI lo trate igual que un `ErrorEvent`.
 */
function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ type: 'error', code, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

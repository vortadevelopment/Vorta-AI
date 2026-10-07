import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { allowedOrigins } from './env.js';
import { tenant } from './middleware/tenant.js';
import type { AppEnv } from './middleware/types.js';
import { chat } from './routes/chat.js';
import { suggestions } from './routes/suggestions.js';
import { SYSTEM_HEADER } from '@vorta/ai-contracts';

/**
 * App del asistente.
 *
 * Orden de los middlewares: CORS primero (un preflight no debe tocar Supabase),
 * luego el tenant, que resuelve el sistema y autentica. En Hono el middleware
 * solo aplica a lo que se registra después, así que este orden importa.
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    cors({
      // Lista cerrada: solo los dominios de los ERPs. Sin `VORTA_ALLOWED_ORIGINS`
      // configurada, ningún navegador puede llamar a la API.
      origin: (origin) => (allowedOrigins().includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', SYSTEM_HEADER],
      maxAge: 86_400,
    }),
  );

  // Fuera del middleware de tenant a propósito: es el chequeo de despliegue y no
  // debe depender de ninguna credencial.
  app.get('/health', (c) => c.json({ ok: true, service: 'vorta-ai-api' }));

  app.use('/chat', tenant);
  app.use('/suggestions', tenant);

  app.route('/chat', chat);
  app.route('/suggestions', suggestions);

  // Cualquier error que no se haya manejado sale con la forma de `ErrorEvent`
  // del contrato, para que el UI tenga un solo formato de error que entender.
  app.onError((cause, c) => {
    if (cause instanceof HTTPException) {
      const response = cause.getResponse();
      if (response !== undefined) return response;
    }
    console.error('[api] error no manejado:', cause);
    return c.json(
      {
        type: 'error',
        code: 'internal_error',
        message: 'Ocurrió un error inesperado.',
      },
      500,
    );
  });

  return app;
}

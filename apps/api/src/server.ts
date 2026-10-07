import { serve } from '@hono/node-server';
import { createApp } from './app.js';

/**
 * Servidor local de desarrollo.
 *
 * Existe porque `vercel dev` necesita el proyecto linkeado a un equipo de
 * Vercel, y para trabajar en el UI o probar una pregunta no hace falta una
 * cuenta. Es la misma app de `app.ts`, servida sobre Node: lo que se prueba aquí
 * es exactamente lo que corre en producción.
 *
 * En producción NO se usa: Vercel entra por `api/index.ts`. Este archivo vive en
 * `src/`, que Vercel no despliega como función.
 *
 * Para verificar el comportamiento real de la plataforma (rutas, headers,
 * límites de la función) sigue estando `pnpm dev:vercel`, que requiere
 * `vercel link`.
 *
 * El script que lo arranca se llama `dev:local` y NO `dev` a propósito:
 * `vercel dev` ejecuta el script `dev` del package como si fuera el dev server
 * de un framework, y los dos acabarían peleándose por el puerto.
 */
const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`vorta-ai-api escuchando en http://localhost:${info.port}`);
});

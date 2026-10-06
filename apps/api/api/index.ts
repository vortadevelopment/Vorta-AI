import { Hono } from 'hono';
import { handle } from 'hono/vercel';

/**
 * Entry de Vercel. Fase 0: solo /health, para verificar que el monorepo
 * despliega. La app real (middleware de auth, resolución de sistema, POST
 * /chat con SSE) se monta desde `src/app.ts` en la Fase 2.
 */
const app = new Hono().get('/health', (c) =>
  c.json({ ok: true, service: 'vorta-ai-api', phase: 0 }),
);

export default handle(app);

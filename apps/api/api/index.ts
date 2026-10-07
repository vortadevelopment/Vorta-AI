import { handle } from 'hono/vercel';
import { createApp } from '../src/app.js';

/**
 * Entry de Vercel. Toda la app vive en `src/app.ts`; esto solo la adapta al
 * runtime de Functions.
 */
export default handle(createApp());

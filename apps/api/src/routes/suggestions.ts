import { Hono } from 'hono';
import type { SuggestionsResponse } from '@vorta/ai-contracts';
import type { AppEnv } from '../middleware/types.js';

/**
 * Estado vacío del chat. Vive en el backend para que el UI no tenga que
 * hardcodear las sugerencias de cada uno de los 8 ERPs.
 */
export const suggestions = new Hono<AppEnv>();

suggestions.get('/', (c) => {
  const system = c.get('system');
  const body: SuggestionsResponse = {
    businessName: system.businessName,
    suggestions: system.suggestions,
  };
  return c.json(body);
});

import Anthropic from '@anthropic-ai/sdk';
import { anthropicApiKey } from '../env.js';

let cached: Anthropic | undefined;

/**
 * Cliente de Anthropic. Es el único secreto de servidor del asistente y nunca
 * sale de aquí: el UI solo habla con esta API, jamás con la de Anthropic.
 */
export function anthropic(): Anthropic {
  if (cached === undefined) {
    cached = new Anthropic({ apiKey: anthropicApiKey() });
  }
  return cached;
}

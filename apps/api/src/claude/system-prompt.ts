import type Anthropic from '@anthropic-ai/sdk';
import type { SystemConfig } from '../systems/types.js';
import { BASE_RULES } from './base-rules.js';

/**
 * Arma el system prompt en dos bloques, con el breakpoint de caché entre ellos:
 *
 *  1. ESTABLE — reglas base + contexto del sistema. Es idéntico para todas las
 *     peticiones de un mismo ERP, así que se cachea. El orden de render es
 *     tools → system → messages, así que este bloque va justo después del
 *     catálogo, que también es estable.
 *
 *  2. VOLÁTIL — la fecha de hoy y los roles del usuario. Va DESPUÉS del
 *     breakpoint a propósito: si la fecha entrara en el bloque cacheado, el
 *     caché se invalidaría cada medianoche y, peor, cada usuario con roles
 *     distintos tendría su propio prefijo.
 */
export function buildSystemPrompt(
  config: SystemConfig,
  options: { roles: string[]; today: string },
): Anthropic.Beta.BetaTextBlockParam[] {
  const stable = [
    BASE_RULES,
    '',
    '---',
    '',
    `## Este negocio`,
    '',
    `Nombre: ${config.businessName}`,
    `Giro: ${config.industry}`,
    `Moneda: ${config.currency}`,
    `Zona horaria: ${config.timeZone}`,
    '',
    config.notes,
  ].join('\n');

  const roles =
    options.roles.length === 0
      ? 'El usuario no tiene roles asignados; solo puede usar las tools que te aparecen.'
      : `Roles del usuario: ${options.roles.join(', ')}.`;

  const volatile = [
    `Hoy es ${options.today} (hora de ${config.timeZone}). Resuelve "hoy", "esta semana", "este mes" y cualquier referencia relativa contra esta fecha.`,
    roles,
  ].join('\n');

  return [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ];
}

/** Fecha de hoy como YYYY-MM-DD en la zona del sistema. */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

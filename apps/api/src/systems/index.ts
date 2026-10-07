import { acm } from './acm.js';
import type { SystemConfig } from './types.js';

/**
 * Registro de sistemas. Dar de alta un ERP nuevo = un archivo aquí al lado y
 * un renglón en este objeto; nada más del backend cambia.
 */
const SYSTEMS: Record<string, SystemConfig> = { [acm.slug]: acm };

/**
 * Resuelve el slug del header `X-Vorta-System`. Devuelve `undefined` si el slug
 * no existe o si el sistema quedó declarado a medias, sin URL o sin anon key:
 * en los dos casos la respuesta correcta es `unknown_system`, no un 500 más
 * adelante al intentar hablar con un Supabase sin dirección.
 */
export function resolveSystem(slug: string | undefined): SystemConfig | undefined {
  if (slug === undefined) return undefined;
  const config = SYSTEMS[slug.trim().toLowerCase()];
  if (config === undefined) return undefined;
  if (config.supabase.url === '' || config.supabase.anonKey === '') return undefined;
  return config;
}

export type { SystemConfig };

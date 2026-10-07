import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '../supabase/client.js';
import type { SystemConfig } from '../systems/types.js';

/**
 * Lo que el middleware de tenant deja en el contexto. Tipar las `Variables` de
 * Hono es lo que hace que una ruta no pueda leer `c.get('db')` sin haber pasado
 * por el middleware.
 */
export interface AppVariables {
  system: SystemConfig;
  user: User;
  /** Cliente de Supabase de ese sistema, ya con el JWT del usuario. */
  db: SupabaseClient;
}

export type AppEnv = { Variables: AppVariables };

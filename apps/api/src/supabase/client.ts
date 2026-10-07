import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SystemConfig } from '../systems/types.js';

/**
 * Cliente de Supabase POR PETICIÓN: anon key del sistema + el JWT del usuario
 * en el header `Authorization`. Así cada RPC `ai_*` —que es `security
 * invoker`— se ejecuta con el `auth.uid()` del usuario real y RLS decide qué
 * puede ver.
 *
 * Nunca se construye con la service role key: el asistente no debe poder leer
 * nada que el usuario no pueda leer por sí mismo.
 *
 * No hay cliente global compartido a propósito: un cliente por petición es lo
 * que impide que el token de un sistema se use contra otro.
 */
export function createSystemClient(config: SystemConfig, accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export type { SupabaseClient };

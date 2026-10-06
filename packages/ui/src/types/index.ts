import type { ChatMessage } from '@vorta/ai-contracts';

/** Props del componente raíz que el ERP monta una sola vez. */
export interface VortaAssistantProps {
  /** Slug del sistema, p. ej. 'acm'. */
  system: string;
  /** Base de la API, p. ej. 'https://vorta-ai-api.vercel.app'. */
  apiUrl: string;
  /**
   * Devuelve el access token de Supabase del usuario actual. Se invoca en cada
   * petición (no se cachea) para que un token renovado se use de inmediato.
   */
  getAccessToken: () => string | Promise<string>;
  /** Nombre del usuario, solo para el saludo del estado vacío. */
  userName?: string;
  /** Historial inicial, si el ERP ya lo tiene cargado. */
  initialMessages?: ChatMessage[];
  /** Se dispara al abrir o cerrar el panel (para telemetría del ERP). */
  onOpenChange?: (open: boolean) => void;
}

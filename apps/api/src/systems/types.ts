/**
 * Contrato de configuración de un sistema (tenant).
 *
 * Un sistema = un ERP = un proyecto de Supabase. Esto es lo ÚNICO que cambia
 * entre los 8 sistemas: ni las tools ni el loop de Claude conocen tablas
 * específicas, solo llaman RPCs estándar.
 */
export interface SystemConfig {
  /** Slug estable, igual al que manda el UI en `X-Vorta-System`. */
  slug: string;

  /** Nombre del negocio tal como el asistente debe nombrarlo al usuario. */
  businessName: string;

  /** Giro del negocio; entra al system prompt para dar contexto al modelo. */
  industry: string;

  /** Zona horaria IANA para resolver "hoy", "este mes", etc. */
  timeZone: string;

  /** Código ISO 4217 de la moneda en que se formatean los importes. */
  currency: string;

  /** Credenciales públicas del Supabase del sistema, leídas de env. */
  supabase: {
    url: string;
    /**
     * Anon key. Las lecturas se hacen con esta key MÁS el JWT del usuario en
     * el header Authorization, de modo que RLS resuelve qué puede ver.
     */
    anonKey: string;
  };

  /** 4–6 sugerencias del estado vacío del chat, en el lenguaje del negocio. */
  suggestions: string[];

  /**
   * RPCs que este sistema expone, del catálogo estándar `ai_*`. Permite que un
   * ERP sin, por ejemplo, módulo de compras no ofrezca esa tool.
   */
  enabledTools: string[];
}
